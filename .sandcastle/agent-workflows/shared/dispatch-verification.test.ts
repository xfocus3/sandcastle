import { describe, expect, it } from "vitest";
import { dispatchDecision, dispatchMissing } from "../../../scripts/dot/dispatch-verification.mjs";
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
