## Java ownership and defensive copies

- Prefer the smallest correct change. Before adding or retaining `clone()`, a collection copy, wrapper, or abstraction, trace who creates, owns, reuses, and mutates the value through the real call path.
- Do not add defensive copies merely because a returned collection must be unmodifiable. An unmodifiable view and an independent snapshot are different contracts. A fresh, exclusively owned backing array that is never mutated after handoff may be wrapped directly when the API contract permits it.
- Keep defensive copies when the documented contract requires a snapshot or when a reachable caller, reused buffer, or concurrent writer can mutate the backing data. If ownership is uncertain, investigate before removing a copy; do not assume safety.
- Test the required observable behavior: null handling, order, size, and rejection of mutation where promised. Do not introduce a defensive-copy guarantee solely to justify the implementation. Retain isolation tests when isolation is part of the contract.
- Reviewers must challenge redundant allocations and abstractions using call-path evidence, preserve required behavior, and rerun focused tests after simplification.

## Java verification

Run the target repository's Java compilation command (for example `./mvnw test-compile` or `./gradlew testClasses`) and focused tests before committing. Use its configured JDK and Maven/Gradle wrapper, modules, and task equivalents. Broader integration or live-database checks depend on the affected behavior; do not run the entire database matrix by default.
