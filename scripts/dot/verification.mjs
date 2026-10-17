import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function verifiedHead(runs, head, workflows) {
  if (!Array.isArray(workflows) || workflows.length === 0 ||
      workflows.some(path => typeof path !== "string" || !/^\.github\/workflows\/[^/]+\.ya?ml$/.test(path))) {
    return false;
  }
  return workflows.every(path => {
    const latest = runs.filter(run => run.head_sha === head && run.path === path)
      .sort((a, b) => b.id - a.id)[0];
    return latest?.status === "completed" && latest.conclusion === "success";
  });
}

export function fetchVerification(head, workflows) {
  if (!/^[a-f0-9]{40}$/.test(head)) throw new Error("Expected an exact commit SHA");
  const pages = JSON.parse(execFileSync("gh", [
    "api", "--paginate", "--slurp",
    `repos/${process.env.GH_REPO}/actions/runs?head_sha=${head}&per_page=100`,
  ], { encoding: "utf8" }));
  return verifiedHead(pages.flatMap(page => page.workflow_runs), head, workflows);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [head, configured] = process.argv.slice(2);
  const ready = fetchVerification(head, JSON.parse(configured));
  if (!ready) console.error("Required workflow verification is missing, pending, or unsuccessful for this exact head");
  process.exitCode = ready ? 0 : 1;
}
