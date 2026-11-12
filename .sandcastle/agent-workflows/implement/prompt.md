# TASK

Implement issue #{{ISSUE_NUMBER}}: {{ISSUE_TITLE}}

You are on branch `{{BRANCH}}`, already created from `main`.

# ISSUE

{{ISSUE_CONTEXT}}

# CONTEXT

Read the project's domain and architecture docs before changing code:

- `CONTEXT.md`
- `docs/adr/` if relevant
- `AGENTS.md` and contribution instructions

Explore the repo and relevant tests before editing.

# EXECUTION

Work in tracer bullets: complete one small end-to-end behavior through the existing test seam before starting the next. Apply the red-green-refactor cycle below to each slice; do not batch all tests first and all implementation afterward. Use the configured GitHub Actions checks and inspect their exact-revision feedback before proceeding to the next slice.

Where a test seam already exists, or a new one is being proposed, do red-green-refactor:

1. RED: write a failing test
2. GREEN: implement the smallest correct change
3. REPEAT until the issue is done
4. REFACTOR

Do not improvise new test seams, such as extracting out a method so that it can be tested in isolation. This creates spaghetti tests.

Run the target repository's applicable compilation, test, and formatting checks before committing.

# COMMIT

Make one or more commits on `{{BRANCH}}` with conventional commit messages.

Do not push the branch.
Do not close the issue.
Do not edit labels.
Do not create or edit PRs.

When complete, output `<promise>COMPLETE</promise>`.

## Standards from the pinned Sandcastle tool

The following profiles are selected for the target repository and supplied from this pinned tool checkout. Apply them alongside the target repository's contribution instructions. Do not substitute a moving branch or a target-local copy for these pinned profiles.

{{SANDCASTLE_CODING_STANDARDS}}
