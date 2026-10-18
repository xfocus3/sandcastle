import { describe, expect, it } from "vitest";
import { verifiedHead } from "../../../scripts/dot/verification.mjs";
import { dispatchDecision, dispatchMissing } from "../../../scripts/dot/dispatch-verification.mjs";
const head = "a".repeat(40);
const workflow = {path: ".github/workflows/scoped-java.yml", source: "target-sha", ref: "main"};
const run = {id: 8, event: "workflow_dispatch", head_branch: "main", head_sha: "b".repeat(40), path: workflow.path, display_title: "Sandcastle Java checks: " + head, status: "completed", conclusion: "success"};
describe("scoped Java verification", () => {
  it("binds a controller workflow to the explicitly tested source SHA", () => {
    expect(verifiedHead([run], head, [workflow])).toBe(true);
    expect(dispatchDecision([run], [], head, workflow)).toBe("existing-run");
  });
  it("rejects the wrong source, workflow or unfinished result", () => {
    expect(verifiedHead([run], "c".repeat(40), [workflow])).toBe(false);
    expect(verifiedHead([{...run, path:".github/workflows/other.yml"}], head, [workflow])).toBe(false);
    expect(verifiedHead([{...run, status:"in_progress", conclusion:null}], head, [workflow])).toBe(false);
  });
  it("does not treat ordinary titles as source verification", () => {
    expect(verifiedHead([run], head, [workflow.path])).toBe(false);
    expect(verifiedHead([{...run, display_title:"checks "+head}], head, [workflow])).toBe(false);
  });
  it("rejects results from another controller branch or event", () => {
    expect(verifiedHead([{...run, head_branch:"untrusted"}], head, [workflow])).toBe(false);
    expect(verifiedHead([{...run, event:"pull_request"}], head, [workflow])).toBe(false);
  });
  it("dispatches the trusted controller with the actual PR source and number", () => {
    const calls:any[] = [];
    const api = (method:string, endpoint:string, body?:any) => {
      calls.push({method,endpoint,body});
      if(endpoint.includes("/pulls/")) return {state:"open",head:{sha:head,ref:"agent/fix",repo:{full_name:"owner/work"}},labels:[{name:"agent:review"}]};
      if(endpoint.includes("/actions/runs")) return [{workflow_runs:[]}];
      if(method === "GET" && endpoint.includes("/comments")) return [[]];
      return {};
    };
    dispatchMissing({api,repository:"owner/work",prNumber:2,workflows:[workflow],operationId:"scope-1"});
    expect(calls.find(x=>x.endpoint.endsWith("/dispatches")).body).toEqual({ref:"main",inputs:{target_sha:head,pr_number:"2"}});
    expect(calls.find(x=>x.endpoint.includes("/actions/runs")).endpoint).not.toContain("head_sha=");
  });
});
