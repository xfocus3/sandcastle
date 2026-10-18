import { workflowPath, runForHead } from "./verification-contract.mjs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

export function dispatchDecision(runs, comments, head, workflow) {
  const path = workflowPath(workflow);
  if (!/^[a-f0-9]{40}$/.test(head)) {
    throw new Error("Invalid verification target");
  }
  if (runs.some(run => runForHead(run, head, workflow))) return "existing-run";
  const marker = `<!-- sandcastle-verification:${head}:${workflowPath(workflow)} -->`;
  if (comments.some(comment => comment.body?.includes(marker))) return "uncertain-dispatch";
  return "dispatch";
}

export function dispatchMissing({ api, repository, prNumber, workflows, operationId = randomUUID() }) {
  if (!Array.isArray(workflows) || workflows.length === 0 || workflows.some(workflow => { try { workflowPath(workflow); return false; } catch { return true; } })) throw new Error("No verification workflows configured");
  const pr = api("GET", `repos/${repository}/pulls/${prNumber}`);
  if (pr.state !== "open" || pr.head.repo.full_name !== repository ||
      !pr.labels.some(label => label.name === "agent:review") ||
      pr.labels.some(label => label.name === "agent:in-progress")) {
    throw new Error("PR is not eligible for verification");
  }
  const head = pr.head.sha;
  const runs = api("GET", `repos/${repository}/actions/runs?${workflows.some(workflow => typeof workflow !== "string") ? "" : `head_sha=${head}&`}per_page=100`, null, true)
    .flatMap(page => page.workflow_runs);
  const comments = api("GET", `repos/${repository}/issues/${prNumber}/comments?per_page=100`, null, true).flat();
  const decisions = [];
  for (const workflow of new Set(workflows)) {
    const decision = dispatchDecision(runs, comments, head, workflow);
    decisions.push({ workflow, head, decision });
    if (decision !== "dispatch") continue;
    const current = api("GET", `repos/${repository}/pulls/${prNumber}`);
    if (current.state !== "open" || current.head.sha !== head || current.head.ref !== pr.head.ref || current.head.repo.full_name !== repository ||
        !current.labels.some(label => label.name === "agent:review") ||
        current.labels.some(label => label.name === "agent:in-progress")) {
      throw new Error("PR changed before verification dispatch");
    }
    // Persist intent BEFORE the remote write. An uncertain outcome is reconciled from
    // actual runs on restart; never retry blindly merely because no run is visible yet.
    api("POST", `repos/${repository}/issues/${prNumber}/comments`, {
      body: `<!-- sandcastle-verification:${head}:${workflowPath(workflow)} -->\nVerification requested for commit ${head}.\nWorkflow: ${workflowPath(workflow)}\nRequest: ${operationId}\nIf dispatch is interrupted, inspect actual Actions runs before retrying.`
    });
    api("POST", `repos/${repository}/actions/workflows/${encodeURIComponent(workflowPath(workflow).split("/").at(-1))}/dispatches`, {
      ...(typeof workflow === "string" ? {ref: pr.head.ref} : {ref: workflow.ref, inputs: {target_sha: head, pr_number: String(prNumber)}})
    });
  }
  return decisions;
}

function githubApi(method, endpoint, body, paginate = false) {
  const args = ["api", "--method", method];
  if (paginate) args.push("--paginate", "--slurp");
  args.push(endpoint);
  if (body) args.push("--input", "-");
  const output = execFileSync("gh", args, {
    encoding: "utf8", input: body ? JSON.stringify(body) : undefined
  });
  return output.trim() ? JSON.parse(output) : null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [prNumber, configured] = process.argv.slice(2);
  if (!/^[1-9][0-9]*$/.test(prNumber)) throw new Error("Expected a PR number");
  console.log(JSON.stringify(dispatchMissing({
    api: githubApi, repository: process.env.GH_REPO, prNumber: Number(prNumber),
    workflows: JSON.parse(configured)
  })));
}
