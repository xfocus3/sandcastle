# TASK

Implement issue #{{ISSUE_NUMBER}}: {{ISSUE_TITLE}}

You are on branch `{{BRANCH}}`, already created from `main`.

# ISSUE

{{ISSUE_CONTEXT}}

# CONTEXT

Read the project's domain and architecture docs before changing code:

- `CONTEXT.md`
- `docs/adr/` if relevant
- `.sandcastle/CODING_STANDARDS.md`

Explore the repo and relevant tests before editing.

# EXECUTION

Work in tracer bullets: complete one small end-to-end behavior through the existing Java test seam before starting the next. Apply the red-green-refactor cycle below to each slice; do not batch all tests first and all implementation afterward. Use the configured GitHub Actions checks and inspect their exact-revision feedback before proceeding to the next slice.

Where a test seam already exists, or a new one is being proposed, do red-green-refactor:

1. RED: write a failing test
2. GREEN: implement the smallest correct change
3. REPEAT until the issue is done
4. REFACTOR

Do not improvise new test seams, such as extracting out a method so that it can be tested in isolation. This creates spaghetti tests.

Run the repository's Java compilation command (e.g. `./mvnw test-compile` or `./gradlew testClasses`, using its configured JDK and wrapper/module/task equivalents) before committing. Run focused tests where relevant.

# COMMIT

Make one or more commits on `{{BRANCH}}` with conventional commit messages.

Do not push the branch.
Do not close the issue.
Do not edit labels.
Do not create or edit PRs.

When complete, output `<promise>COMPLETE</promise>`.


## Verification scope

Prove each bug with a failing regression before the fix, then run the focused regression and the relevant neighboring package or affected module, plus compilation and repository formatting checks. Use the configured JDK and Maven/Gradle wrapper. Select broader integration or live-database checks when the changed behavior requires them; do not make the entire upstream CI matrix the default prerequisite for private code review. Run these checks through the configured Actions feedback loop and record exact source revisions, commands, passes, failures, skips, and untested coverage. Never count a timeout, stale run, missing test, or baseline failure as a pass. Report wider checks deferred to upstream CI explicitly; upstream contribution and maintainer requirements still apply. Recheck after review changes.

## Java ownership review

Trace allocation, ownership, reuse, and mutation before adding or removing defensive copies. An unmodifiable view does not by itself require a snapshot: avoid redundant clones only when the real call path and API contract make it safe. Preserve copies where isolation is required, and test the required behavior rather than imposing an undocumented copy guarantee. Apply the project's `.sandcastle/CODING_STANDARDS.md` when present.
