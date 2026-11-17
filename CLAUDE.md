Use `npm run typecheck` for type checking.

Check [./CONTEXT.md](./CONTEXT.md) for terminology questions.

For user-facing changes, add a changeset to `.changeset`. Check all changesets there first to see if there are duplicates. We use `@changesets/cli`, but you can create/edit the file manually. Make all bugfixes `patch`, all new features or breaking changes `minor` (since we're pre-1.0). Use `package.json#name` for the name.

When changing public-facing behavior, check `README.md` to see if the documentation needs updating.

## Final pull request descriptions

When preparing or revising a final PR description, use the environment's `pr` skill whenever it is available and read it fresh for that preparation. Explicit selection takes precedence over automatic discovery. Preserve the target repository's issue/Jira reference, license/relicensing text and checklist, and report only exact-revision evidence. Never use the internal draft work-PR receipt as the final description. See `scripts/prepare-final-pr.ts`; official Hibernate preparation uses the stricter `scripts/prepare-official-pr.ts`.

## Agent skills

### Issue tracker

Issues live as GitHub issues in `mattpocock/sandcastle`; external PRs are also a triage surface. See `docs/agents/issue-tracker.md`.

### Triage labels

Default canonical labels. Agent provider support is detailed here. See `docs/agents/triage.md`.

### Domain docs

Single-context layout: `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
