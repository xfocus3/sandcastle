# Focused Java verification

Use the smallest meaningful scope that proves a change, then expand to neighboring tests or the affected module. Keep the existing tracer-bullet/red-green-refactor loop: reproduce the intended failure, implement the fix, inspect the exact-source result, and refactor only after green.

Before moving a PR to `agent:review`, the coordinator records a plan in the target repository's default branch at `.sandcastle/verification-plans/<PR number>.json`. The plan is project coordination, not part of an upstream code patch. Preserve existing plans when resuming work.

Example Gradle plan:

```json
{
  "build_tool": "gradle",
  "java_version": "25",
  "database": "h2",
  "arguments": [
    ":module:test",
    "--tests",
    "example.RegressionTest",
    "--tests",
    "example.neighbors.*",
    "formatChecks"
  ],
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
[
  {
    "path": ".github/workflows/scoped-java.yml",
    "source": "target-sha",
    "ref": "main"
  }
]
```

Use the actual trusted default branch instead of `main` where different. This source identity is accepted only for the configured workflow path. The reusable workflow validates same-repository PR ownership and current SHA, runs the trusted plan against that SHA, saves XML/source evidence, rejects formatter changes for an unpatched target, and rechecks the PR head afterward. A renamed title, wrong source, pending run, stale revision or failed run does not satisfy the review gate.

The dispatcher records intent before launching Actions, reconciles existing runs, and does not duplicate builds after restart. Missing plans and failed checks require diagnosis; neither is success. Add or adjust the plan when the issue changes scope.

Keep full upstream CI optional for private review unless the change needs its coverage. Database-specific SQL needs relevant database validation; mapping/schema changes may need strict schema checks; processor changes may need their whole module. Report skipped/blocked/untested coverage explicitly. Upstream contribution requirements, maintainer review and public CI remain applicable.

Draft-review exceptions can document investigated baseline failures or timeouts at exact run IDs and attempts. They permit review only, never successful-test claims or readiness. Normally, focused verification should pass without an exception.

All build/test execution stays in Actions. The coordinator handles reasoning and handoffs and consumes the actual test feedback; it must not claim a workflow has completed merely because a response was submitted.

## Returning to review

For automatic handoff, pass `resume_workflow: review.yml` to `java-pr-verification.yml` and allow the caller's `actions: write` permission. Only the final handoff job needs that permission. The review caller accepts `pr_number` and `verification_run_id` dispatch inputs and forwards the latter to `agent-pr-queue.yml`. The queue waits for the producer workflow to finish before checking its result. This avoids reviewing while the verification workflow is still completing. Do not additionally dispatch the same review from a competing completion listener.

Before accepting evidence, inspect the XML test reports: required regression tests must have executed and passed, and skipped tests must be disclosed. Artifact upload alone does not prove tests ran. If a plan changes without a source-head change, explicitly start fresh verification for the changed plan and use that newer result; the current result identity does not itself encode a plan hash.

### Updating review standards

Implementation and review stages embed selected `.sandcastle/standards/` profiles
from the pinned Sandcastle checkout. `.sandcastle/CODING_STANDARDS.md` is their
human-readable index. They do not rely on those files existing in the target
repository. Keep target-specific instructions and apply the embedded lessons
only where their contracts and risks match.

Publishing a standards change alone does not update pinned consumers. Publish
and verify the tool revision first, update the review job's `tool_ref` in
`agent-pr-queue.yml`, then update the caller's reusable-workflow SHA to that
queue revision. Keep immutable SHAs: do not change running reviews or replay an
old checkpoint under new standards. Standards are part of the recovery
controller fingerprint.

## Branch updates before verification

The automatic `update-branch` stage only performs fast-forward updates or an already-up-to-date no-op. Divergent histories fail before a merge commit, rebase, agent invocation, or source-branch publication. This is a deliberate safety limit, not an inference from contribution-guide prose and not automatic rebase support. Its existing workflow failure path reports the blocker and removes the in-progress label.

Before a separate authorized update, read the target repository's current contribution instructions, select its permitted integration method, and preserve its commit-message and attribution requirements. Re-adding the label without resolving divergence will not unblock it. Hibernate requires rebasing instead of merge commits; other projects may have different policies.

After integrating upstream changes, audit new callers and run the relevant checks on the resulting source revision. Use direct database assertions before a flush when immediate persistence is the contract. Report earlier-head evidence as historical, not validation of the rebased head. Updating the pinned review standards and the pinned branch-update tool are separate rollout steps; neither starts or resumes an existing agent task.

### Target-specific standards profiles

Issue implementation, PR feedback implementation, and review embed standards selected by the target `GH_REPO`, with optional explicit `SANDCASTLE_UPSTREAM_REPOSITORY` taking precedence for forks. The loader reads only pinned tool profiles, never replacement text from the target working directory. Hibernate ORM, `xfocus3/hibernate-orm`, and `xfocus3/hibernate-work` receive shared + Java + Hibernate; Sandcastle receives shared + Sandcastle TypeScript. Unknown projects receive shared guidance, plus Java when their target build manifests indicate Maven or a Gradle build with Java sources. A branch name or HHH issue key alone never selects Hibernate.

The index is `.sandcastle/CODING_STANDARDS.md`; profile text lives under `.sandcastle/standards/`. Selection happens for each implementation/review invocation and the selected profile names are included in its prompt. Existing runs retain their pinned version. Publish and pin a new tool revision to deliver profile changes; do not replay old checkpoints with changed standards.
