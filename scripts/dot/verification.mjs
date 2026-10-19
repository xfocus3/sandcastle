import { workflowPath, runForHead } from "./verification-contract.mjs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function verifiedHead(runs, head, workflows) {
  if (!Array.isArray(workflows) || workflows.length === 0 ||
      workflows.some(path => { try { workflowPath(path); return false; } catch { return true; } })) {
    return false;
  }
  return workflows.every(path => {
    const latest = runs.filter(run => runForHead(run, head, path))
      .sort((a, b) => b.id - a.id)[0];
    return latest?.status === "completed" && latest.conclusion === "success";
  });
}


export function reviewableHead(runs, head, workflows, exception) {
  if (verifiedHead(runs, head, workflows)) return true;
  if (!/^[a-f0-9]{40}$/.test(head) || !Array.isArray(workflows) || workflows.length === 0 ||
      workflows.some(path => { try { workflowPath(path); return false; } catch { return true; } }) ||
      exception?.head !== head || typeof exception.reason !== "string" || !exception.reason.trim() ||
      !Array.isArray(exception.evidence) || exception.evidence.length === 0 ||
      exception.evidence.some(url => typeof url !== "string" || !url.startsWith("https://github.com/")) ||
      !Array.isArray(exception.runs)) return false;
  return workflows.every(path => {
    const latest = runs.filter(run => runForHead(run, head, path))
      .sort((a, b) => b.id - a.id)[0];
    if (latest?.status !== "completed") return false;
    if (latest.conclusion === "success") return true;
    if (!["failure", "timed_out", "cancelled"].includes(latest.conclusion)) return false;
    return exception.runs.some(accepted =>
      accepted.id === latest.id && accepted.attempt === latest.run_attempt &&
      accepted.path === workflowPath(path) && accepted.conclusion === latest.conclusion &&
      ["baseline", "infrastructure", "timeout"].includes(accepted.classification) &&
      (latest.conclusion !== "cancelled" || accepted.classification === "timeout"));
  });
}

export function fetchVerification(head, workflows, exception = null) {
  if (!/^[a-f0-9]{40}$/.test(head)) throw new Error("Expected an exact commit SHA");
  const runs = [];
  for (let page = 1; ; page++) {
    const response = JSON.parse(execFileSync("gh", [
      "api",
      `repos/${process.env.GH_REPO}/actions/runs?${workflows.some(workflow => typeof workflow !== "string") ? "" : `head_sha=${head}&`}per_page=100&page=${page}`,
      "--jq", "{workflow_runs: [.workflow_runs[] | {id, head_sha, path, status, conclusion, run_attempt, event, head_branch, display_title}]}",
    ], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }));
    runs.push(...response.workflow_runs);
    if (response.workflow_runs.length < 100) break;
  }
  return exception ? reviewableHead(runs, head, workflows, exception) : verifiedHead(runs, head, workflows);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [head, configured, exceptionJson] = process.argv.slice(2);
  const exception = exceptionJson ? JSON.parse(exceptionJson) : null;
  if (exception && (exception.repository !== process.env.GH_REPO ||
      String(exception.pr_number) !== process.env.PR_NUMBER)) {
    throw new Error("Review exception belongs to another repository or PR");
  }
  const ready = fetchVerification(head, JSON.parse(configured), exception);
  if (!ready) console.error("Required workflow verification is missing, pending, or unsuccessful for this exact head");
  process.exitCode = ready ? 0 : 1;
}
