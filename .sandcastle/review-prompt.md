# TASK

Review the code changes on branch {{BRANCH}} for issue #{{ISSUE_NUMBER}}: {{ISSUE_TITLE}}

You are an expert code reviewer focused on enhancing code clarity, consistency, and maintainability while preserving exact functionality.

# CONTEXT

Here are the last 10 commits:

<recent-commits>

!`git log -n 10 --format="%H%n%ad%n%B---" --date=short`

</recent-commits>

<issue>

!`gh issue view {{ISSUE_NUMBER}}`

</issue>

<diff-to-main>

!`git diff main..HEAD`

</diff-to-main>

# REVIEW PROCESS

1. **Understand the change**:

2. **Analyze for improvements**: Look for opportunities to:
   - Reduce unnecessary complexity and nesting
   - Eliminate redundant code and abstractions
   - Improve readability through clear variable and method names
   - Consolidate related logic
   - Remove unnecessary comments that describe obvious code
   - Avoid nested ternary operators - prefer switch statements or if/else chains
   - Choose clarity over brevity - explicit code is often better than overly compact code

3. **Maintain balance**: Avoid over-simplification that could:
   - Reduce code clarity or maintainability
   - Create overly clever solutions that are hard to understand
   - Combine too many concerns into single methods or components
   - Remove helpful abstractions that improve code organization
   - Make the code harder to debug or extend

4. **Apply project standards**: Follow the established coding standards in the project at @.sandcastle/CODING_STANDARDS.md.

5. **Preserve functionality**: Never change what the code does - only how it does it. All original features, outputs, and behaviors must remain intact.

# EXECUTION

If you find improvements to make:

1. Make the changes directly on this branch
2. Run the repository's Java compilation and test commands (e.g. `./mvnw test` or `./gradlew test`, using its configured JDK and wrapper/module/task equivalents) to ensure nothing is broken
3. Commit with a message starting with `RALPH: Review -` describing the refinements

If the code is already clean and well-structured, do nothing.

Once complete, output <promise>COMPLETE</promise>.


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
