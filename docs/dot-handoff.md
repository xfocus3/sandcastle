# dot handoff transport (in progress)

The Java prompts retain the original Sandcastle stages and techniques. `dot()`
replaces the agent-call transport. It does not replace planning, iteration,
review, extraction, retry, merge or publication logic.

## This checkpoint

The wired transport passed Actions run 39033582684 at commit
`e82b109325eeb6b3af0a3af8d717b6ae53b3a113`: 55 test files, 1480 passed,
2 existing skipped tests. Java baseline run 39033599836 executed one Maven and
one Gradle JUnit test, each passing with no skips. All five agent entrypoints and the local templates now
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

An active runner can continue after the coordinator reconnects. Its request and
response identities remain unchanged; inspect the actual run before responding.

The five agent stages now enter through `scripts/dot/stage.ts`. It records the
pre-stage Git snapshot, whitelisted project inputs and immutable exploration
batch in an immediate `dot-stage-input-<id>` artifact. Provider requests include
that stage identity, and `.sandcastle/dot/journal.json` records exchanges. The
coordinator must copy the sanitized stage input and request/response chain into
the authorized repository before those artifacts expire.

For a lost runner, save `.sandcastle/recovery/resume.json` on a controlled
`sandcastle/dot-resume/**` branch with `stage` (the original input), `exchanges`
(the ordered request/response records; only the final response may be missing),
and `lease: { ref, head }` for the original task branch. The read-only recovery
workflow first checks the old run is terminal, its attempt/controller SHA still
match, and the task branch has not advanced. It then restores the clean stage
entry, executes the same original script and replays completed provider calls
only when the exact expanded prompt, Git/ref/index/worktree state and logical
session match. The first unfinished call creates a fresh run-bound request;
an old response cannot satisfy it. An unused journal entry or changed context
blocks recovery. No push, PR, review, label or target merge is replayed by this
workflow. The coordinator must reconcile those effects separately before any
authorized publication.

This is stage-boundary replay, not resumption of a JavaScript stack. The core
restart regressions and real expired-runner workflow still need Actions
verification. The original local multi-round planner loops are not yet wrapped
for expired-process replay: generated branch names and concurrent scheduling
need stable entry records. Do not claim automatic recovery for those paths.

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
