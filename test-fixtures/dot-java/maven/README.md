# Maven Java prompt fixture

This single-module Java 17/JUnit Jupiter fixture is a small target for native
prompt-driven implementation using
`.sandcastle/agent-workflows/implement/prompt.md`. Sandcastle itself remains
TypeScript.

## Public behavior and deliberately retained bug

`Basket.add(item, quantity)` adds positive quantities of an item, and
`Basket.quantityOf(item)` returns its current quantity, or zero when absent.
The baseline test `example.BasketTest#recordsFirstAddition` covers one addition.

Repeated additions currently replace the earlier quantity instead of
accumulating it. The follow-up task is to add two coffees, then three coffees,
and observe five through `quantityOf("coffee")`. The current implementation
would return three. No failing regression test or fix is included yet: the
native implementation step must add that test, observe its intended assertion
failure in GitHub Actions, and only then make the minimum production fix.

## Commands and execution

Run builds and tests only in the authorized GitHub Actions job, from
`test-fixtures/dot-java/maven`, using JDK 17. Direct Maven commands with the
job's configured Maven version are:

```sh
mvn -B -Dtest=example.BasketTest test
mvn -B verify
```

Actions generates fixture tooling with the official, pinned Maven Wrapper
plugin before executing the wrapper. `MAVEN_VERSION` must be set to the Maven
version explicitly selected by the job:

```sh
mvn -B org.apache.maven.plugins:maven-wrapper-plugin:3.3.2:wrapper -Dmaven="${MAVEN_VERSION}" -Dtype=only-script
./mvnw -B -Dtest=example.BasketTest test
./mvnw -B verify
```

Wrapper files are generated tooling, not hand-written fixture source. No
wrapper generation or binary files are included in this baseline. The POM pins
JUnit and the build plugins; no services, credentials, formatter, static-analysis
plugin, or integration suite are required.

Status: unrun. The baseline is expected to execute one passing test; no Actions
run or checked-SHA evidence has been observed yet. Record the exact command,
run URL, checked SHA, and actual test count for each subsequent baseline,
RED, GREEN, and final verification result. Keep generated reports in Actions,
out of fixture source.
