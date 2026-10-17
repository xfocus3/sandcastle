# Gradle prompt-verification fixture

This small Java target exercises Sandcastle's implementation prompt at
`.sandcastle/implement-prompt.md`. Sandcastle itself remains TypeScript. The
fixture has one public checkout API and one baseline JUnit test; no external
service, model provider, credentials, or remote repository is required.

## Requirement and seeded bug

For nonnegative order subtotals, checkout must apply a 10% discount when the
subtotal is **at least 10,000 cents**. The discount amount is truncated to whole
cents before subtraction. Smaller orders receive no discount.

The baseline test checks that a 20,000-cent order costs 18,000 cents. The seeded
bug is an exclusive threshold: a 10,000-cent order currently costs 10,000 cents,
although the requirement calls for 9,000 cents. The exact-threshold regression
test and production fix are deliberately absent so a later native prompt-driven
iteration can establish genuine RED before changing production code.

## Pinned tooling and Actions-only execution

- Java toolchain and compiler release: 17
- Gradle: 8.10.2
- JUnit Jupiter: 5.11.4; JUnit Platform launcher: 1.11.4
- Dependencies: Maven Central

All builds, tests, and wrapper generation run in GitHub Actions against the
coordinator's pinned commit SHA. Do not build or test this fixture locally.

The Actions job must provision JDK 17 and official Gradle 8.10.2 using
`gradle/actions/setup-gradle`, with `gradle-version: '8.10.2'`. From this fixture's
build root, generate its wrapper with:

```sh
gradle wrapper --gradle-version 8.10.2 --distribution-type bin
```

The wrapper scripts and wrapper directory are generated fixture tooling on the
runner, not checked-in source. Subsequent commands use that generated wrapper.
The missing wrapper before this explicit bootstrap is expected; it is not a
reason to substitute a different Gradle version.

Build root: `test-fixtures/dot-java/gradle`.

Focused baseline command:

```sh
./gradlew test --tests example.checkout.CheckoutTest --rerun-tasks --no-daemon
```

Standard full fixture verification:

```sh
./gradlew clean check --rerun-tasks --no-daemon
```

These compile the Java target and execute JUnit tests. No separate formatter,
static-analysis plugin, or integration-test suite is configured.

## Later RED/GREEN iteration

1. Apply `.sandcastle/implement-prompt.md` to the requirement above. Add one
   public-behavior regression test named `discountsOrdersAtExactThreshold` in
   `example.checkout.CheckoutTest`, expecting 9,000 cents for a 10,000-cent order.
2. Have Actions execute the following focused command on the test-only
   checkpoint, and inspect the JUnit report to confirm the intended assertion
   failed with expected `9000` and actual `10000`:

   ```sh
   ./gradlew test --tests example.checkout.CheckoutTest.discountsOrdersAtExactThreshold --rerun-tasks --no-daemon
   ```

3. Only after observing that behavioral RED, make the minimum production fix
   and rerun the same focused command in Actions on its new pinned SHA.
4. Run the full fixture verification on the final SHA, retaining the original
   baseline test. Record the run URL, checked SHA, exact commands, and actual
   test counts and conclusions. Compilation errors, missing tooling, or zero
   tests are blockers rather than behavioral RED or GREEN.

## Evidence status

Unrun. No build, compiler, wrapper generation, or test has been executed while
preparing this fixture. Baseline success and the exact-threshold failure are
expected from source inspection only; neither is observed Actions evidence.
