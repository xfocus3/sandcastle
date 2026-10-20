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

## Hibernate ORM review checklist

For Hibernate ORM changes, apply the relevant checks below even when the target repository has no `.sandcastle/CODING_STANDARDS.md`. These are conditional lessons from merged maintainer reviews, not universal rules. Respect the target branch's contracts, supported JDK, and task scope.

- For expression-taking SQL functions, cover parameters and other supported expressions as well as literals. Preserve generic input types when the operation preserves them, without requiring APIs newer than the supported JDK. (#11391)
- Test relevant option values explicitly, including enabled and disabled behavior where applicable; do not rely on defaults or claim untested modes. (#12880)
- Reuse known keys and persisters through equivalent helper overloads rather than repeating lookups. Do not introduce unrelated caching. (#12880)
- For cache/circular initialization, distinguish an existing holder from an initialized one. Complete initialization at the responsible loading layer instead of suppressing downstream lifecycle behavior. (#12880)
- For SPIs allowing at most one registered provider, report multiple providers through the subsystem's error mechanism rather than selecting the first. Check zero/one/multiple cases, including any documented default. (#13560)
- Pass extensions the relevant datastore/repository context instead of guessing framework policy in core code; avoid generic context bags. Mark Hibernate Java-service SPIs with the project's `@JavaServiceLoadable` convention. (#13560)
- Use one getter result for a related check-and-use or serialization operation when consistency requires it. Keep the fix narrow; this does not make `Session` thread-safe. (#11261)

Full context and exact maintainer comments: [Sandcastle's Hibernate ORM lessons](https://github.com/xfocus3/sandcastle/blob/feat/java-agent-workflows/.sandcastle/CODING_STANDARDS.md#hibernate-orm-maintainer-review-lessons).
