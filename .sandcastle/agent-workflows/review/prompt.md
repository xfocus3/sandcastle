# TASK

Review PR #{{PR_NUMBER}} on branch `{{BRANCH}}`.

PR title: {{PR_TITLE}}
Linked issue: #{{ISSUE_NUMBER}} {{ISSUE_TITLE}}

You are an expert code reviewer. Your job is not just to comment. Actively improve the branch when a concrete improvement is warranted, then explain what you changed.

# LINKED ISSUE

{{LINKED_ISSUE}}

# DIFF TO MAIN

```diff
{{DIFF_TO_MAIN}}
```

# PR COMMENTS

```json
{{PR_COMMENTS_JSON}}
```

# REVIEW PROCESS

1. Read the diff carefully.
2. Verify the PR satisfies the linked issue.
3. Stress-test edge cases and add tests where useful.
4. Improve clarity, maintainability, and consistency while preserving behavior.
5. Respond to unresolved human review threads when useful:
   - Address: change code and reply
   - Decline: do not change code, reply with why
   - Defer: no reply, only for stale/context-only comments

Read `CONTEXT.md`, relevant ADRs, and `.sandcastle/CODING_STANDARDS.md`.

Run the repository's Java compilation command (e.g. `./mvnw test-compile` or `./gradlew testClasses`, using its configured JDK and wrapper/module/task equivalents) before committing. Run focused tests where relevant.

If you make changes, commit them as a single conventional commit.
If the code is already clean and there is nothing to answer, make no commit.

Do not push.
Do not edit labels.
Do not mark review threads resolved.
Do not create GitHub comments yourself.

When complete, output `<promise>COMPLETE</promise>`.


## Verification scope

Prove each bug with a failing regression before the fix, then run the focused regression and the relevant neighboring package or affected module, plus compilation and repository formatting checks. Use the configured JDK and Maven/Gradle wrapper. Select broader integration or live-database checks when the changed behavior requires them; do not make the entire upstream CI matrix the default prerequisite for private code review. Run these checks through the configured Actions feedback loop and record exact source revisions, commands, passes, failures, skips, and untested coverage. Never count a timeout, stale run, missing test, or baseline failure as a pass. Report wider checks deferred to upstream CI explicitly; upstream contribution and maintainer requirements still apply. Recheck after review changes.

## Java ownership review

Trace allocation, ownership, reuse, and mutation before adding or removing defensive copies. An unmodifiable view does not by itself require a snapshot: avoid redundant clones only when the real call path and API contract make it safe. Preserve copies where isolation is required, and test the required behavior rather than imposing an undocumented copy guarantee. Apply the project's `.sandcastle/CODING_STANDARDS.md` when present.
