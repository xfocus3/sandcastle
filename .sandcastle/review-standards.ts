import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Context of the repository being changed, never inferred from the tool checkout. */
export interface StandardsContext {
  readonly repository?: string;
  readonly upstreamRepository?: string;
  readonly targetDirectory?: string;
  readonly javaBuild?: boolean;
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

/** Read selected standards from the pinned tool; target files cannot replace those profiles. */
export const readReviewStandards = (context: StandardsContext = {}): string => {
  const directory = context.targetDirectory ?? process.cwd();
  const profiles = selectStandardsProfiles({
    repository: context.repository ?? process.env.GH_REPO,
    upstreamRepository:
      context.upstreamRepository ?? process.env.SANDCASTLE_UPSTREAM_REPOSITORY,
    javaBuild: context.javaBuild ?? hasJavaBuild(directory),
  });
  return [
    `Selected standards profiles: ${profiles.join(", ")}.`,
    ...profiles.map((profile) =>
      readFileSync(
        new URL(`./standards/${profile}.md`, import.meta.url),
        "utf8",
      ),
    ),
  ].join("\n\n");
};
