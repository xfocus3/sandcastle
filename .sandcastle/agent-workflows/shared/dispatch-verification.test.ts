import { beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { dispatchDecision, dispatchMissing, githubApi } from "../../../scripts/dot/dispatch-verification.mjs";
const head = "a".repeat(40);
const workflow = ".github/workflows/ci.yml";
describe("verification dispatch", () => {
  it("dispatches only a missing exact-head run", () => {
    expect(dispatchDecision([], [], head, workflow)).toBe("dispatch");
    expect(dispatchDecision([{head_sha: "b".repeat(40), path: workflow}], [], head, workflow)).toBe("dispatch");
  });
  it.each(["success", "failure", "action_required", "cancelled", null])("does not duplicate or bypass an existing %s run", conclusion => {
    expect(dispatchDecision([{head_sha: head, path: workflow, conclusion}], [], head, workflow)).toBe("existing-run");
  });
  it("holds uncertain dispatches across restarts", () => {
    expect(dispatchDecision([], [{body: `<!-- sandcastle-verification:${head}:${workflow} -->`}], head, workflow)).toBe("uncertain-dispatch");
  });
  it("rejects invalid targets", () => {
    expect(() => dispatchDecision([], [], "main", workflow)).toThrow();
    expect(() => dispatchDecision([], [], head, "../ci.yml")).toThrow();
  });
  function fixture({changed = false, failDispatch = false, receipt = false} = {}) {
    const calls: any[] = [];
    let reads = 0;
    const api = (method: string, endpoint: string, body?: any) => {
      calls.push({method, endpoint, body});
      if (method === "GET" && endpoint.includes("/pulls/")) {
        reads++;
        return {state:"open", head:{sha:changed && reads > 1 ? "b".repeat(40) : head, ref:"agent/fix", repo:{full_name:"owner/work"}},
          labels:[{name:"agent:review"}]};
      }
      if (method === "GET" && endpoint.includes("/actions/runs")) return [{workflow_runs:[]}];
      if (method === "GET" && endpoint.includes("/comments")) return [receipt ? [{body:`<!-- sandcastle-verification:${head}:${workflow} -->`}] : []];
      if (method === "POST" && endpoint.includes("/dispatches") && failDispatch) throw new Error("remote outcome unknown");
      return {};
    };
    return {calls, api, repository:"owner/work", prNumber:2, workflows:[workflow], operationId:"request-1"};
  }
  it("saves intent before dispatch and uses the actual PR branch", () => {
    const f = fixture(); dispatchMissing(f);
    const writes = f.calls.filter(c => c.method === "POST");
    expect(writes).toHaveLength(2);
    expect(writes[0].body.body).toContain(head);
    expect(writes[1].endpoint).toContain("/ci.yml/dispatches");
    expect(writes[1].body).toEqual({ref:"agent/fix"});
  });
  it("rejects a head that changes before dispatch", () => {
    const f = fixture({changed:true});
    expect(() => dispatchMissing(f)).toThrow("PR changed");
    expect(f.calls.filter(c => c.method === "POST")).toHaveLength(0);
  });
  it("does not retry an uncertain remote write", () => {
    const f = fixture({failDispatch:true});
    expect(() => dispatchMissing(f)).toThrow("remote outcome unknown");
    expect(f.calls.filter(c => c.endpoint.includes("/dispatches"))).toHaveLength(1);
    const restart = fixture({receipt:true}); dispatchMissing(restart);
    expect(restart.calls.filter(c => c.method === "POST")).toHaveLength(0);
  });
});

vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }));

describe("dispatch history transport", () => {
  const pr = {state:"open", head:{sha:head, ref:"agent/fix", repo:{full_name:"owner/work"}},
    labels:[{name:"agent:review"}]};
  const options = {api:githubApi, repository:"owner/work", prNumber:2, workflows:[workflow]};
  beforeEach(() => vi.clearAllMocks());

  it("projects run fields and bounds each command response", () => {
    vi.mocked(execFileSync).mockReturnValue(JSON.stringify({workflow_runs:[]}));
    expect(githubApi("GET", "repos/owner/work/actions/runs?per_page=100", null, true)).toEqual([{workflow_runs:[]}]);
    const args = vi.mocked(execFileSync).mock.calls[0][1] as string[];
    expect(args).toContain("--jq");
    expect(args.join(" ")).toContain("display_title");
    expect(args).not.toContain("--slurp");
    expect(vi.mocked(execFileSync).mock.calls[0][2]).toMatchObject({maxBuffer:8 * 1024 * 1024});
  });

  it("finds an existing run on a later page without dispatching", () => {
    vi.mocked(execFileSync).mockImplementation((_command, args) => {
      const endpoint = (args as string[])[3];
      if (endpoint.includes("/pulls/")) return JSON.stringify(pr);
      if (endpoint.includes("/comments")) return "[]";
      return JSON.stringify({workflow_runs:endpoint.includes("page=2")
        ? [{head_sha:head, path:workflow}]
        : Array.from({length:100}, () => ({head_sha:"b".repeat(40), path:workflow}))});
    });
    expect(dispatchMissing(options)[0].decision).toBe("existing-run");
    expect(vi.mocked(execFileSync).mock.calls.some(call => (call[1] as string[]).includes("POST"))).toBe(false);
  });

  it("preserves an older comment intent marker across pagination", () => {
    vi.mocked(execFileSync).mockImplementation((_command, args) => {
      const endpoint = (args as string[])[3];
      if (endpoint.includes("/pulls/")) return JSON.stringify(pr);
      if (endpoint.includes("/actions/runs")) return JSON.stringify({workflow_runs:[]});
      return JSON.stringify(endpoint.includes("page=2")
        ? [{body:`<!-- sandcastle-verification:${head}:${workflow} -->`}]
        : Array.from({length:100}, () => ({body:"Earlier comment"})));
    });
    expect(dispatchMissing(options)[0].decision).toBe("uncertain-dispatch");
    expect(vi.mocked(execFileSync).mock.calls.some(call => (call[1] as string[]).includes("POST"))).toBe(false);
    expect(vi.mocked(execFileSync).mock.calls.some(call => (call[1] as string[]).includes("[.[] | {body}]"))).toBe(true);
  });

  it.each(["read-error", "malformed"])("performs no writes after %s history", mode => {
    vi.mocked(execFileSync).mockImplementation((_command, args) => {
      if ((args as string[])[3].includes("/pulls/")) return JSON.stringify(pr);
      if (mode === "read-error") throw new Error("history unavailable");
      return JSON.stringify({workflow_runs:null});
    });
    expect(() => dispatchMissing(options)).toThrow();
    expect(vi.mocked(execFileSync).mock.calls.some(call => (call[1] as string[]).includes("POST"))).toBe(false);
  });

  it("stops on an empty comment page", () => {
    vi.mocked(execFileSync).mockReturnValue("[]");
    expect(githubApi("GET", "repos/owner/work/issues/2/comments?per_page=100", null, true)).toEqual([[]]);
    expect(execFileSync).toHaveBeenCalledTimes(1);
  });
});
