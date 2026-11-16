# Coding standards index

Standards are selected from the pinned tool checkout for the target repository, not the tool repository's working directory.

- [Shared](standards/shared.md): general engineering and verification guidance, loaded for every target.
- [Java](standards/java.md): Java ownership and toolchain guidance.
- [Hibernate](standards/hibernate.md): scoped Hibernate ORM maintainer lessons.
- [Sandcastle TypeScript](standards/sandcastle-typescript.md): Sandcastle's Effect, Node, sandbox, and TypeScript conventions.

Hibernate ORM and its recognized work forks load shared + Java + Hibernate. Sandcastle loads shared + Sandcastle TypeScript. Other targets with a Maven or Gradle Java build load shared + Java; unknown targets load shared only. Explicit upstream identity takes precedence over a fork's target identity. Target contribution instructions remain applicable; project-specific lessons are not universal policy.

Explore, issue implementation, PR fixes and review embed the selected profiles. Target workflows supply an immutable expected tool revision; the loader rejects a mismatched checkout or modified tracked standards/stage files before invoking the agent. Startup logs and the prompt record the actual tool revision, selected profiles and a SHA-256 of their exact text. See the [coverage and rollout ledger](../docs/hibernate-feedback-2026-11-16.md).
