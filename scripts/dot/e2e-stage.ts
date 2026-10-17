// Controlled integration harness. The production stage scripts remain unchanged.
// Publishing PRs, reviews, labels and target merges is deliberately outside this test.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, join } from "node:path";

const context = JSON.parse(
  readFileSync("test-fixtures/dot-java/context.json", "utf8"),
);
const stage = process.env.GITHUB_REF_NAME?.split("/").at(-1) ?? context.stage;
if (
  !["explore", "implement", "review", "implement-pr", "update-branch"].includes(
    stage,
  )
) {
  throw new Error("Choose an original stage in sandcastle/dot-e2e/<stage>");
}
const output = process.env.OUTPUT_DIR;
if (!output) throw new Error("OUTPUT_DIR is required");
mkdirSync(output, { recursive: true });
Object.assign(process.env, {
  ISSUE_NUMBER: String(context.issueNumber),
  ISSUE_TITLE: context.issueTitle,
  PR_NUMBER: String(context.prNumber),
  BRANCH: process.env.GITHUB_REF_NAME,
  BASE_REF: context.baseRef ?? "main",
  ISSUES_FILE: resolve("test-fixtures/dot-java/explore-batch.json"),
});
const head = () =>
  execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const before = head();
await import(`../../.sandcastle/agent-workflows/${stage}/${stage}.ts`);
const after = head();
if (stage === "implement") {
  if (after === before)
    throw new Error("Native implement returned without a code commit");
  const paths = execFileSync("git", ["diff", "--name-only", before, after], {
    encoding: "utf8",
  })
    .trim()
    .split("\n");
  if (
    !paths.length ||
    paths.some((path) => !path.startsWith("test-fixtures/dot-java/maven/"))
  ) {
    throw new Error(
      "Native implement changed files outside its controlled Maven fixture",
    );
  }
  if (
    !paths.some((path) => path.includes("/src/test/")) ||
    !paths.some((path) => path.includes("/src/main/"))
  ) {
    throw new Error(
      "Native implement must return both the behavioral regression and its implementation",
    );
  }
}
writeFileSync(
  join(output, "receipt.json"),
  JSON.stringify(
    {
      version: 1,
      stage,
      runId: process.env.GITHUB_RUN_ID,
      runAttempt: process.env.GITHUB_RUN_ATTEMPT,
      inputHead: before,
      resultHead: after,
      status: "stage_returned",
    },
    null,
    2,
  ),
);
