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

## Hibernate ORM maintainer review lessons

Use these checks when the changed Hibernate ORM code has the relevant contract. They are lessons from maintainer feedback on other contributors' merged PRs, not a claim that isolated reviews establish project-wide policy. Follow the target branch's current APIs, supported JDK, contribution rules, and task scope. In other Java projects, transfer a principle only when the same conditions hold.

1. **Handle the full expression contract.** SQL functions that accept expressions must work with bind parameters and other supported expressions, not just literals. Keep a literal fast path alongside a correct general path where the rendering needs it; do not split every implementation unnecessarily. Source: beikov, [#11391](https://github.com/hibernate/hibernate-orm/pull/11391#discussion_r2599019568).
2. **Preserve generic types and the supported JDK baseline.** When an operation preserves its input collection type, preserve that type in the API's result rather than widening it. Check the target branch before adopting a newer JDK API: the Java 17 constraint in this review was specific to that branch, not a permanent ban on `SequencedCollection`. Source: beikov, [#11391](https://github.com/hibernate/hibernate-orm/pull/11391#discussion_r2598902427).
3. **Set relevant test options explicitly.** For behavior controlled by an option, exercise the relevant alternatives explicitly instead of depending on the current default. The accepted cache-loading tests cover `SessionCheckMode.ENABLED` and `DISABLED`, including instance identity and preservation of modified state. Do not claim additional requested modes were tested unless the final tests show it. Source: mbellade, [#12880](https://github.com/hibernate/hibernate-orm/pull/12880#pullrequestreview-4600145990).
4. **Reuse information already available in the call path.** Prefer an equivalent helper overload accepting the known `EntityKey` and persister over one that looks up the same information again. This is a specific redundant-lookup removal, not a reason to introduce arbitrary caches or unrelated optimizations. Source: mbellade, [#12880](https://github.com/hibernate/hibernate-orm/pull/12880#discussion_r3570325141).
5. **Separate existence from completed initialization.** In second-level-cache loading with circular references, an existing entity holder may still be uninitialized. Complete initialization at the responsible loading layer, reusing the existing instance when appropriate, rather than masking the state with downstream lifecycle suppression. The accepted fix belongs in `CacheLoadHelper`, not the proposed `SessionImpl` workaround. Source: beikov, [#12880](https://github.com/hibernate/hibernate-orm/pull/12880#discussion_r3796963445).
6. **Enforce single-provider contracts explicitly.** If an SPI allows at most one registered provider, reject multiple providers instead of selecting a potentially nondeterministic first result. Use the subsystem's error mechanism: this processor uses a default implementation when none is registered and reports a compiler `ERROR` for multiple providers, not necessarily an exception. Check zero, one, and multiple providers according to the contract. Source: yrodiere, [#13560](https://github.com/hibernate/hibernate-orm/pull/13560#discussion_r4217249100).
7. **Give extensions the context needed for their decision.** Where an integration selects a session qualifier, pass the relevant datastore and repository context so the extension can apply its policy. Avoid framework-specific guessing in core code and avoid expanding this into a generic context bag. Source: yrodiere, [#13560](https://github.com/hibernate/hibernate-orm/pull/13560#discussion_r4218306161).
8. **Read once when an operation needs one consistent value.** Store a getter's potentially changing result in a local for a related check-and-use sequence or serialization operation. Keep the change narrow: this does not make `Session` thread-safe, prove every repeated getter unsafe, or justify arbitrary null fallbacks. Two broader changes in this PR were removed before merge. Sources: gavinking, [#11261 acceptance](https://github.com/hibernate/hibernate-orm/pull/11261#discussion_r2537914478) and [serialization review](https://github.com/hibernate/hibernate-orm/pull/11261#discussion_r2537920643).
9. **Mark Hibernate's service-loadable SPIs for discovery.** Use `@JavaServiceLoadable` on Hibernate SPIs intended for Java service loading, following the project's convention. This was a minor discoverability improvement; do not introduce the Hibernate annotation into unrelated ecosystems. Source: sebersole, [#13560](https://github.com/hibernate/hibernate-orm/pull/13560#discussion_r4166868076).

### Evidence scope

The cited comment authors are identified as Hibernate organization members in GitHub's review metadata. The examples were checked against the final merged patches:

- #11391: yybmion, merged December 15, 2025.
- #12880: jjennnn, merged August 18, 2026.
- #13560: FroMage, merged October 14, 2026.
- #11261: werner77, merged December 9, 2025.

Contributor acknowledgments, forwarded AI critiques, and superseded suggestions are not treated as maintainer guidance. In particular, #12880's final patch does not establish the additionally requested `REFRESH_SESSION` coverage. The earlier ownership example above is separate from this merged-PR evidence set.
