# Maven Java prompt fixture

This single-module Java 17/JUnit Jupiter fixture is a small target for native
prompt-driven implementation using
`.sandcastle/agent-workflows/implement/prompt.md`. Sandcastle itself remains
TypeScript.

## Public behavior and regression coverage

`Basket.add(item, quantity)` adds positive quantities of an item, and
`Basket.quantityOf(item)` returns its current quantity, or zero when absent.
Repeated additions accumulate: adding two coffees and then three coffees
produces a quantity of five.

`example.BasketTest` covers the first addition, repeated additions, and a
missing item. The repeated-addition case protects against replacing the
previous quantity instead of accumulating it.

## Commands and execution

Run builds and tests only in the authorized GitHub Actions job, from
`test-fixtures/dot-java/maven`, using JDK 17. Direct Maven commands with the
job's configured Maven version are:

```sh
mvn -B -Dtest=example.BasketTest test
mvn -B verify
```

An authorized Actions job can generate fixture tooling with the official, pinned
Maven Wrapper plugin before executing the wrapper. `MAVEN_VERSION` must be set to the Maven
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

The Actions job should publish the JUnit XML reports for the exact checked commit.
Verify the actual test count and result there before treating a revision as
passing. Keep generated reports in Actions, out of fixture source.
