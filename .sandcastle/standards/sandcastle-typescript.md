# Sandcastle TypeScript standards

Wherever possible, use Effect primitives like `FileSystem` over promises. This is so that we can make use of DI and type-safe errors from Effect. However, Effect should not leak out into the user-facing API.

Even if the outer function is a promise (such as in user-facing API's) the inner function should immediately delegate to Effect. Running multiple `.runPromise`'s inside a single function should be a red flag that we need to refactor to something like this:

```ts
const outerFunc = async () => {
  const inner = Effect.gen(function* () {
    // Do stuff in here
  }).pipe(Effect.runPromise);
};
```

---

Never use `new Error()` inside an Effect closure (e.g. `Effect.fail(new Error(...))` or the `catch` of `Effect.tryPromise`). Always fail with a tagged error from `errors.ts` (or define a new `Data.TaggedError` if none fits). Raw `Error` widens the inferred error channel to a generic `Error` / `unknown` and erases the type-safe error tracking Effect gives us — downstream `Effect.catchTag` / `Effect.catchAll` lose the discriminant they need to recover narrowly. The same rule applies to functions returning Effects: their failure channel should be a tagged-error union, never a bare `Error`.

```ts
// BAD: raw Error widens the failure channel
Effect.tryPromise({
  try: () => doThing(),
  catch: (e) =>
    new Error(`Failed: ${e instanceof Error ? e.message : String(e)}`),
});

// GOOD: tagged error — failure channel stays narrow and discriminated
Effect.tryPromise({
  try: () => doThing(),
  catch: (e) =>
    new WorktreeError({
      message: `Failed: ${e instanceof Error ? e.message : String(e)}`,
    }),
});
```

---

Before writing a changeset, explore other potentially related changesets so you don't duplicate effort.

You may write more than one changeset per commit, if the commit touches multiple user-facing behaviors.

---

When writing sandbox providers, don't share provider-specific code between them. Each provider — for instance Vercel and Daytona — integrates a different SDK and is a different concern; that integration logic must not be shared, even when two providers look similar today, because they will diverge.

The one exception is **pure, provider-agnostic utilities**: logic that references no provider SDK, no provider config, and whose behavior is purely a function of its inputs (e.g. a bounded string-tail buffer). These may live in a shared module. Test: if you can't tell which provider a function is for by reading it, it's a utility, not a shared abstraction.

---

`exec` with an `onLine` callback must call `onLine` in real-time as output arrives, not after the command completes. The orchestrator uses `onLine` callbacks to reset an idle timeout — if lines aren't emitted during execution, the timeout will fire prematurely or hangs won't be detected. Always use a streaming/WebSocket-based API from the underlying SDK, never execute-then-split.

---

Any public-facing properties or functions should have JSDOC comments explaining them.

---

Do not use lazy `import()`-style imports when importing Node built-ins. Just use imports.

---

Paths destined for the sandbox container (passed to `copyFileIn` / `copyFileOut` / `exec`, or stored as a sandbox cwd / projects dir) are always Linux paths. Use `posix.join` from `node:path`, not the bare platform-aware `join` — on Windows hosts the latter emits `\` separators, and `docker cp` / `podman cp` reject them silently (the run continues but data is lost).

Host-side paths (anything under `tmpdir()`, `hostRepoDir`, the host projects dir) should keep using platform-aware `join`.

---

When comparing two paths — `===`, `startsWith`, `Set.has`, `.includes`, etc. — normalize separators on both sides first (e.g. `p.replace(/\\/g, "/")`). `git` reports forward slashes on every platform, while `node:path.join`/`normalize` emit `\` on Windows, so a raw comparison between a git-derived path and a join-derived path silently fails on Windows. This is invisible on Linux/macOS CI because both sources emit `/` there, so it will not surface in tests unless you deliberately mix the two separator styles. When the result is returned for downstream `join`/fs use, re-apply platform-native `normalize` so callers get consistent separators; only the comparison needs forward slashes.

---

Optional parameters passed to functions should be scrutinised extremely carefully. They are a huge source of bugs (by omission). Prioritise correctness over backwards compatibility.

---

Every interactive prompt in the `sandcastle init` flow must be paired with a non-interactive CLI flag that resolves the same choice. They are linked: adding a new prompt without adding the matching flag breaks scripted / CI setup (no TTY → the prompt wedges or crashes), and adding a flag without wiring it into the prompt path leaves the interactive experience inconsistent. When stdin is not a TTY and the flag is absent for a prompt that would otherwise fire, fail fast with a message naming the missing flag rather than letting the prompt library crash. New prompt + new flag land in the same change.

---

If you need to provide an override to a function or modules' behavior during tests, don't use an `@internal` property, like so:

```ts
// BAD
type Example = {
  /** @internal Test-only override for the idle warning interval in milliseconds. Default: 60000 (1 minute). */
  readonly _idleWarningIntervalMs?: number;
  /** @internal Override for the host projects directory (for testing). */
  readonly _hostProjectsDir?: string;
  /** @internal Override for the sandbox projects directory (for testing). */
  readonly _sandboxProjectsDir?: string;
};
```

Instead, create a config layer using Effect for that function, then instantiate that differently in tests and in production. This helps keep the code cleaner. Don't make this layer optional - that adds more indirection to all layers of the code.

---

## TypeScript testing examples

```typescript
// GOOD: Tests observable behavior through the public interface
test("createUser makes user retrievable", async () => {
  const user = await createUser({ name: "Alice" });
  const retrieved = await getUser(user.id);
  expect(retrieved.name).toBe("Alice");
});
```

```typescript
// BAD: Mocks internal collaborator, tests HOW not WHAT
test("checkout calls paymentService.process", async () => {
  const mockPayment = jest.mock(paymentService);
  await checkout(cart, payment);
  expect(mockPayment.process).toHaveBeenCalledWith(cart.total);
});

// BAD: Couples a retrieval test to storage unrelated to its contract
test("createUser saves to database", async () => {
  await createUser({ name: "Alice" });
  const row = await db.query("SELECT * FROM users WHERE name = ?", ["Alice"]);
  expect(row).toBeDefined();
});
```
