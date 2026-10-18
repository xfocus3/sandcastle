/** Supported verification workflows and their exact-source identity. */
export function workflowPath(workflow) {
  const path = typeof workflow === "string" ? workflow : workflow?.path;
  if (typeof path !== "string" || !/^\.github\/workflows\/[^/]+\.ya?ml$/.test(path)) throw new Error("Invalid verification workflow");
  if (typeof workflow !== "string" && (workflow.source !== "target-sha" || typeof workflow.ref !== "string" || !/^[A-Za-z0-9_./-]+$/.test(workflow.ref))) throw new Error("Invalid scoped verification controller");
  return path;
}
/** Scoped controllers must checkout target_sha and reject source changes before success. */
export function runForHead(run, head, workflow) {
  return run.path === workflowPath(workflow) && (typeof workflow === "string"
    ? run.head_sha === head
    : run.display_title === "Sandcastle Java checks: " + head);
}
