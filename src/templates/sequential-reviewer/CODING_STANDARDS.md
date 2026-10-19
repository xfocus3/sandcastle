# Coding Standards

<!-- Customize this file with your project's coding standards.
     The reviewer agent loads it during code review via @.sandcastle/CODING_STANDARDS.md
     so these standards are enforced during review without costing tokens during implementation. -->

## Style

<!-- Example:
- Use camelCase for variables and methods
- Use PascalCase for classes and types
- Prefer explicit imports over wildcard imports
-->

## Testing

<!-- Example:
- Every public method must have at least one test
- Use descriptive test names that explain the expected behavior
-->

## Architecture

<!-- Example:
- Keep modules focused on a single responsibility
- Prefer composition over inheritance
-->

## Java ownership and defensive copies

- Prefer the smallest correct change. Before adding or retaining `clone()`, a collection copy, wrapper, or abstraction, trace who creates, owns, reuses, and mutates the value through the real call path.
- Do not add defensive copies merely because a returned collection must be unmodifiable. An unmodifiable view and an independent snapshot are different contracts. A fresh, exclusively owned backing array that is never mutated after handoff may be wrapped directly when the API contract permits it.
- Keep defensive copies when the documented contract requires a snapshot or when a reachable caller, reused buffer, or concurrent writer can mutate the backing data. If ownership is uncertain, investigate before removing a copy; do not assume safety.
- Test the required observable behavior: null handling, order, size, and rejection of mutation where promised. Do not introduce a defensive-copy guarantee solely to justify the implementation. Retain isolation tests when isolation is part of the contract.
- Reviewers must challenge redundant allocations and abstractions using call-path evidence, preserve required behavior, and rerun focused tests after simplification.

Example: [Hibernate HHH-20328 review](https://github.com/hibernate/hibernate-orm/pull/13712/commits/684b74e44a1047162ba796d6a8ced4331cf3521e) removed redundant result-array clones after verifying that `StandardRowReader` allocates a fresh array per result. Null handling and unmodifiable-list behavior remain covered; this is not a blanket rule against copying.
