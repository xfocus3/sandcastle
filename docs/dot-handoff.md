# dot handoff transport (in progress)

The Java prompts retain the original Sandcastle stages and techniques. `dot()`
replaces the agent-call transport. It does not replace planning, iteration,
review, extraction, retry, merge or publication logic.

## This checkpoint

The provider core passed Actions run 39032731103 at commit
`f07639196203943400fac3e163e1c4a30b59e449`: 55 test files, 1460 passed,
2 existing skipped tests. All five agent entrypoints and the local templates now
use dot; JavaScript action steps supply the artifact runtime context.
Live Actions artifact exchange, native-worker execution,
mid-cycle Java checks and expired-runner recovery are **not yet verified**.
Do not activate an existing privileged agent workflow to test this checkpoint.
The feature-branch `Dot transport CI` workflow runs only deterministic tests.

## One active invocation

1. Sandcastle expands the original prompt and starts its ordinary sandbox.
2. The host-side provider captures HEAD, explicitly requested task refs, index
   stages, pending merge metadata and changed/untracked source. Unpublished
   commits are bundled only for HEAD and those task/merge refs. Unrelated local
   branches and tags are not exported. Raw index machine-stat data is excluded.
3. A request is uploaded immediately, rather than in a step after the waiting
   invocation. This needs a JavaScript-action context with the standard Actions
   artifact runtime identity. A normal shell step must not assume it has that
   identity. No external LLM key or native assistant transcript is involved.
4. The active coordinator reads the request through GitHub, reviews its source
   scope, restores it in a disposable clone, and applies the original prompt
   using native dot workers. The coordinator remains responsible for actual
   authorization; JSON fields do not grant publication or merge permission.
5. While the invocation waits, the coordinator can publish a test-only or fix
   checkpoint and use a separate read-only, exact-SHA Actions validation run.
   Actual run results feed the same native task's red/green/refactor sequence.
   The waiting job is not a general remote-shell service.
6. The coordinator reviews the result commit and its exact changed paths, then
   saves `responses/<request-id>.json` on the same repository's configured
   response branch (`sandcastle-dot-responses` by default).
7. The provider checks request hash, run/attempt, input head, task-ref/worktree
   lease and changed-path list. It fetches only from the existing same-repository
   origin and requires the result to descend from the input and merge parents.
   It applies the result before returning stdout/session metadata to the
   existing Sandcastle completion/extraction logic.

The request's `sessionId` is a public logical exchange identifier, never a native
assistant thread ID. The coordinator can continue the same worker or reconstruct
its task from the sanitized request/response chain. Token usage is unknown.

The wait is bounded to at most 45 minutes, below the original 60-minute job
timeout. A pending request, timeout, cancellation or blocked response is not
completion. The coordinator must poll while active; this installs no always-on
callback into dot.

## Source reconstruction and limits

Run `node scripts/dot-restore.mjs request.json disposable-clone` only in a clean,
disposable clone of the request's verified repository. The clone must already
have the published prerequisite commits; the helper never selects a new remote
or runs project code. It restores unpublished objects, index stages, working
changes and merge metadata. Build and tests still run in Actions.

Snapshot capture currently requires Node and Git on a POSIX host with the same
worktree (no-sandbox or a bind-mounted Docker/Podman sandbox). Isolated remote
sandboxes are rejected until a cancellable snapshot transport is supported.
Transport Git processes are killed as a group on cancellation/deadline. It fails
closed for submodules, in-progress rebase/sequencer/autostash operations,
potentially private file paths, escaping symlinks and capture errors. It does
not silently omit these states. A result that would discard unrelated tracked
working changes is rejected; those changes must be explicitly reconciled in the
reviewed result. This is not a promise of support for every repository state.

Inspect the first controlled snapshot's manifest and source scope before live
publication. Known private-path rejection and workspace-path redaction are not
a general secret detector. Do not place credentials or private assistant data in
the source workspace or response. Artifacts expire; the coordinator must save
the sanitized request, source checkpoint, response and next step durably in the
authorized repository for recovery.

## Recovery boundary

An active runner can continue after the coordinator reconnects. An expired runner
cannot resume its JavaScript stack. This checkpoint does **not** implement safe
expired-runner stage replay. A later resume wrapper must restore a recorded
stage boundary and reconcile already-published branch/PR/review effects before
continuing. Blind reruns of the original workflows are unsafe.

## Response shape

The response repeats `id`, `requestHash`, `runId`, `runAttempt` and input `head`.
It supplies `resultHead`, the exact `changedPaths`, `status` (`completed` or
`blocked`) and the original stage's `stdout`. `completed` means the exchange
returned; the original completion marker and output schema still determine
whether the Sandcastle stage succeeded. Never put a fabricated test result in
stdout or substitute it for an Actions run receipt.

## Controlled end-to-end runs

`Dot native handoff` runs the original stage script on pushes to
`sandcastle/dot-e2e/<stage>`. Stages are `explore`, `implement`, `review`,
`implement-pr`, and `update-branch`. The fixture context is in
`test-fixtures/dot-java/context.json`; replace synthetic issue/PR numbers with
coordinator-created controlled records before testing stages which require them.
The workflow has read-only repository permissions and does not run the original
publication/label steps. Passing this harness proves the stage handoff, not those
GitHub side effects. Original label workflows retain their original behavior and
permissions; do not use untrusted PR code to test them.

`Dot Java check` runs Maven and Gradle fixtures on an exact pushed checkpoint on
`sandcastle/dot-check/**`. It generates official wrappers on the runner and saves
JUnit XML, keyed by the actual `github.sha`. Publish a failing regression first,
observe the expected assertion failure, then publish the smallest fix and rerun.
These runs happen while the original native invocation is waiting. Report the
run ID, attempt, SHA, selected test and observed result; infrastructure failures
are not behavioral RED evidence. Manual dispatch becomes available only after
the workflow is registered on the repository's default branch; the bounded push
triggers allow feature-branch verification first.

The scaffolded Java Dockerfile uses `ARG JAVA_VERSION=17`. Set this to the target
repository's actual JDK/toolchain version before building, rather than imposing
17 on every Java project. The Java wrapper dependency hook is a starting point;
use the repository's configured module/profile/task equivalents. Node remains
required to run Sandcastle itself.
