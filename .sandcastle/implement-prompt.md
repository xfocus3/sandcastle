# TASK

Fix issue #{{ISSUE_NUMBER}}: {{ISSUE_TITLE}}

Pull in the issue using `gh issue view`, with comments. If it has a parent PRD, pull that in too.

Only work on the issue specified.

Work on branch {{BRANCH}}. Make commits, run tests, and close the issue when done.

# CONTEXT

Here are the last 10 commits:

<recent-commits>

!`git log -n 10 --format="%H%n%ad%n%B---" --date=short`

</recent-commits>

# EXPLORATION

Explore the repo and fill your context window with relevant information that will allow you to complete the task.

Pay extra attention to test files that touch the relevant parts of the code.

# EXECUTION

If applicable, use RGR to complete the task.

1. RED: write one test
2. GREEN: write the implementation to pass that test
3. REPEAT until done
4. REFACTOR the code

# FEEDBACK LOOPS

Before committing, run the repository's Java compilation and test commands (e.g. `./mvnw test` or `./gradlew test`, using its configured JDK and wrapper/module/task equivalents) to ensure the tests pass.

# COMMIT

Make a git commit. The commit message must:

1. Start with `RALPH:` prefix
2. Include task completed + PRD reference
3. Key decisions made
4. Files changed
5. Blockers or notes for next iteration

Keep it concise.

# THE ISSUE

If the task is not complete, leave a comment on the GitHub issue with what was done.

Do not close the issue - this will be done later.

Once complete, output <promise>COMPLETE</promise>.

# FINAL RULES

ONLY WORK ON A SINGLE TASK.


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
