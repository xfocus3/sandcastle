# Focused Java verification

Use the smallest meaningful scope that proves a change, then expand to neighboring tests or the affected module. Keep the existing tracer-bullet/red-green-refactor loop: reproduce the intended failure, implement the fix, inspect the exact-source result, and refactor only after green.

Before moving a PR to `agent:review`, the coordinator records a plan in the target repository's default branch at `.sandcastle/verification-plans/<PR number>.json`. The plan is project coordination, not part of an upstream code patch. Preserve existing plans when resuming work.

Example Gradle plan:

```json
{
  "build_tool": "gradle",
  "java_version": "25",
  "database": "h2",
  "arguments": [":module:test", "--tests", "example.RegressionTest", "--tests", "example.neighbors.*", "formatChecks"],
  "reason": "Regression and neighboring behavior for the changed module; compilation is included by the test task. Other databases and the full upstream suite are not claimed."
}
```

For Maven, use `build_tool: maven` and the project's wrapper/module arguments, for example `["-pl", "module", "-am", "-Dtest=RegressionTest,NeighborTest", "test"]`. Adapt reactor/test-selection semantics and the actual formatting goal to the project; do not copy a command that excludes required tests or suppresses failures.

The private/default-branch caller `.github/workflows/scoped-java.yml` must:
- use `workflow_dispatch` inputs `target_sha` and `pr_number`
- set `run-name: 'Sandcastle Java checks: ${{ inputs.target_sha }}'`
- invoke the pinned `java-pr-verification.yml` reusable workflow
- grant only `contents: read` and `pull-requests: read`

Configure both verification dispatch and review with:

```json
[{"path":".github/workflows/scoped-java.yml","source":"target-sha","ref":"main"}]
```

Use the actual trusted default branch instead of `main` where different. This source identity is accepted only for the configured workflow path. The reusable workflow validates same-repository PR ownership and current SHA, runs the trusted plan against that SHA, saves XML/source evidence, rejects formatter changes for an unpatched target, and rechecks the PR head afterward. A renamed title, wrong source, pending run, stale revision or failed run does not satisfy the review gate.

The dispatcher records intent before launching Actions, reconciles existing runs, and does not duplicate builds after restart. Missing plans and failed checks require diagnosis; neither is success. Add or adjust the plan when the issue changes scope.

Keep full upstream CI optional for private review unless the change needs its coverage. Database-specific SQL needs relevant database validation; mapping/schema changes may need strict schema checks; processor changes may need their whole module. Report skipped/blocked/untested coverage explicitly. Upstream contribution requirements, maintainer review and public CI remain applicable.

Draft-review exceptions can document investigated baseline failures or timeouts at exact run IDs and attempts. They permit review only, never successful-test claims or readiness. Normally, focused verification should pass without an exception.

All build/test execution stays in Actions. The coordinator handles reasoning and handoffs and consumes the actual test feedback; it must not claim a workflow has completed merely because a response was submitted.

## Returning to review

For automatic handoff, pass `resume_workflow: review.yml` to `java-pr-verification.yml` and allow the caller's `actions: write` permission. Only the final handoff job needs that permission. The review caller accepts `pr_number` and `verification_run_id` dispatch inputs and forwards the latter to `agent-pr-queue.yml`. The queue waits for the producer workflow to finish before checking its result. This avoids reviewing while the verification workflow is still completing. Do not additionally dispatch the same review from a competing completion listener.

Before accepting evidence, inspect the XML test reports: required regression tests must have executed and passed, and skipped tests must be disclosed. Artifact upload alone does not prove tests ran. If a plan changes without a source-head change, explicitly start fresh verification for the changed plan and use that newer result; the current result identity does not itself encode a plan hash.
