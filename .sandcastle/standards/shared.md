## Testing

### Core Principle

Tests verify behavior through public interfaces, not implementation details. Code can change entirely; tests shouldn't break unless behavior changed.

### Good Tests

Integration-style tests that exercise real code paths through public APIs. They describe _what_ the system does, not _how_.

- Test behavior users/callers care about
- Use the public API only
- Survive internal refactors
- One logical assertion per test

### Bad Tests

Red flags:

- Mocking internal collaborators (your own classes/modules)
- Testing private methods
- Asserting on call counts/order of internal calls unrelated to a supported extension contract
- Test breaks when refactoring without behavior change
- Test name describes HOW not WHAT
- Verifying an unrelated implementation detail instead of the promised behavior

Database state and extension dispatch can themselves be observable contracts. For ORM schema generation, locking, and persistence timing, invoke the supported API and inspect the actual database when needed to distinguish persisted state from the session's managed state. For immediate-execution guarantees, make that assertion before any flush or commit that could hide deferred work. A registered extension's invocation is also a valid compatibility assertion; this does not justify mocking arbitrary internal collaborators.

### Mocking

Mock at **system boundaries** only:

- External APIs (payment, email, etc.)
- Time/randomness
- File system or databases when a real instance isn't practical

**Never mock your own classes/modules or internal collaborators.** If something is hard to test without mocking internals, redesign the interface.

Prefer SDK-style interfaces over generic fetchers at boundaries — each function is independently mockable with a single return shape, no conditional logic in test setup.

### TDD Workflow: Vertical Slices

Do NOT write all tests first, then all implementation. That produces tests that verify _imagined_ behavior and are insensitive to real changes.

Correct approach — one test, one implementation, repeat:

```
RED→GREEN: test1→impl1
RED→GREEN: test2→impl2
RED→GREEN: test3→impl3
```

Each test responds to what you learned from the previous cycle. Never refactor while RED — get to GREEN first.

## Interface Design

### Deep Modules

Prefer deep modules: small interface, deep implementation. A few methods with simple params hiding complex logic behind them.

Avoid shallow modules: large interface with many methods that just pass through to thin implementation. When designing, ask: can I reduce the number of methods? Can I simplify the parameters? Can I hide more complexity inside?

### Design for Testability

1. **Accept dependencies, don't create them** — pass external dependencies in rather than constructing them internally.
2. **Return results, don't produce side effects** — a function that returns a value is easier to test than one that mutates state.
3. **Small surface area** — fewer methods = fewer tests needed, fewer params = simpler test setup.

## Shared semantic logic and complete bug fixes

- Extract nontrivial conditional or type-resolution logic into a clearly named method when it obscures the caller's intent. The method should express one semantic rule, not introduce a broad abstraction for its own sake.
- When a defect comes from a rule repeated in sibling code paths, inspect those paths before declaring the fix complete. Correct the same root cause consistently and reuse the smallest appropriate helper instead of copying the patch. Preserve each caller's contextual behavior and keep genuinely different contracts separate.
- Cover every affected entry point through observable behavior, with controls for behavior that must remain unchanged. Follow the existing RED/GREEN cycle for each regression, then refactor and rerun the focused tests; a shared helper alone does not prove that all callers are correct.
- Repeat the caller audit after rebasing: upstream may add entry points without producing a textual conflict. Recheck timing, cleanup, and acquisition order on the combined revision rather than assuming an older test result covers the new call graph.

## Target-branch formatting and publication evidence

- **Respect target-branch formatting rules.** Check the target revision's formatter and source-header configuration before copying headers or style from another branch. Run that revision's format checks; do not add or remove license headers solely because a neighboring branch uses a different convention.
- **Prove publication matches verification.** Before publishing a fix, verify that its complete source tree matches the reviewed GREEN tree, including formatter output. Record the base, tested tree, regression failures, pass/failure/skip counts, and validation scope. A successful upload or workflow job alone is not proof that the expected tests executed or that a separate quality gate passed.

## Verification scope

Prove each bug with a failing regression before the fix, then run the focused regression and relevant neighboring package or affected module, plus compilation and repository formatting checks. Follow the target repository's toolchain and contribution instructions. Use the configured Actions feedback loop when required and record exact source revisions, commands, passes, failures, skips, and untested coverage. Never count a timeout, stale run, missing test, or baseline failure as a pass. Report wider checks deferred to upstream CI explicitly; recheck after review changes.
