import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

/** Context of the repository being changed, never inferred from the tool checkout. */
export interface StandardsContext {
  readonly repository?: string;
  readonly upstreamRepository?: string;
  readonly targetDirectory?: string;
  readonly javaBuild?: boolean;
  readonly expectedToolRevision?: string;
}

export type StandardsProfile =
  | "shared"
  | "java"
  | "hibernate"
  | "sandcastle-typescript";

const repositoryName = (value: string | undefined): string =>
  (value ?? "")
    .trim()
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/^git@github\.com:/i, "")
    .replace(/\.git\/?$/, "")
    .replace(/\/$/, "")
    .toLowerCase();

/** Select applicable profiles deterministically; unknown projects receive shared guidance only. */
export const selectStandardsProfiles = (
  context: StandardsContext,
): StandardsProfile[] => {
  const repository =
    repositoryName(context.upstreamRepository) ||
    repositoryName(context.repository);
  if (
    [
      "hibernate/hibernate-orm",
      "xfocus3/hibernate-orm",
      "xfocus3/hibernate-work",
    ].includes(repository)
  ) {
    return ["shared", "java", "hibernate"];
  }
  if (["mattpocock/sandcastle", "xfocus3/sandcastle"].includes(repository)) {
    return ["shared", "sandcastle-typescript"];
  }
  return context.javaBuild ? ["shared", "java"] : ["shared"];
};

const hasJavaBuild = (directory: string): boolean =>
  existsSync(join(directory, "pom.xml")) ||
  (existsSync(join(directory, "src/main/java")) &&
    ["build.gradle", "build.gradle.kts"].some((name) =>
      existsSync(join(directory, name)),
    ));

const toolDirectory = fileURLToPath(new URL("../", import.meta.url));

const toolRevision = (expected: string | undefined): string => {
  if (expected !== undefined && !/^[0-9a-f]{40}$/.test(expected)) {
    throw new Error(
      "Standards require an immutable 40-character tool revision",
    );
  }
  const revision = execFileSync(
    "git",
    ["-C", toolDirectory, "rev-parse", "HEAD"],
    {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    },
  ).trim();
  if (expected !== undefined) {
    if (revision !== expected) {
      throw new Error(
        `Standards tool revision mismatch: expected ${expected}, got ${revision}`,
      );
    }
    try {
      execFileSync(
        "git",
        [
          "-C",
          toolDirectory,
          "diff",
          "--quiet",
          "HEAD",
          "--",
          ".sandcastle",
          "scripts/dot/stage.ts",
          "scripts/prepare-official-pr.ts",
        ],
        {
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
    } catch {
      throw new Error(
        "Pinned standards tool has modified tracked standards or stage files",
      );
    }
  }
  return revision;
};

/** Read selected standards from the pinned tool; target files cannot replace those profiles. */
export const readReviewStandards = (context: StandardsContext = {}): string => {
  const directory = context.targetDirectory ?? process.cwd();
  const profiles = selectStandardsProfiles({
    repository: context.repository ?? process.env.GH_REPO,
    upstreamRepository:
      context.upstreamRepository ?? process.env.SANDCASTLE_UPSTREAM_REPOSITORY,
    javaBuild: context.javaBuild ?? hasJavaBuild(directory),
  });
  const revision = toolRevision(
    context.expectedToolRevision ?? process.env.SANDCASTLE_EXPECTED_TOOL_REF,
  );
  const selected = profiles.map((profile) => ({
    profile,
    text: readFileSync(
      new URL(`./standards/${profile}.md`, import.meta.url),
      "utf8",
    ),
  }));
  const digest = createHash("sha256")
    .update(JSON.stringify(selected))
    .digest("hex");
  console.log(
    `[standards] revision=${revision} profiles=${profiles.join(",")} sha256=${digest}`,
  );
  return [
    `Standards tool revision: ${revision}.`,
    `Selected standards profiles: ${profiles.join(", ")}.`,
    `Selected standards SHA-256: ${digest}.`,
    ...selected.map(({ text }) => text),
  ].join("\n\n");
};
