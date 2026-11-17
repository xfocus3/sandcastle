import { readFileSync } from "node:fs";
import {
  readFinalPRGuidance,
  readOfficialPRGuidance,
} from "../.sandcastle/official-pr-guidance";

/** Parse publication-host options without reading a target-local skill or posting anything. */
export const preparePRGuidance = (
  args: readonly string[],
  official = false,
) => {
  const options = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const name = args[i];
    const value = args[i + 1];
    if (
      !["--config", "--skill-file", "--template-file"].includes(name ?? "") ||
      !value ||
      options.has(name!)
    )
      throw new Error(
        "Use --template-file with optional --skill-file or --config for final PR preparation",
      );
    options.set(name!, value);
  }
  const configFile =
    options.get("--config") ?? process.env.SANDCASTLE_PUBLICATION_CONFIG;
  let configuredSkill: unknown;
  if (configFile) {
    try {
      configuredSkill = JSON.parse(
        readFileSync(configFile, "utf8"),
      ).prSkillFile;
    } catch {
      throw new Error("Could not read the publication host configuration");
    }
    if (typeof configuredSkill !== "string" || !configuredSkill)
      throw new Error("Publication configuration requires a prSkillFile");
  }
  const skillFile =
    options.get("--skill-file") ??
    (process.env.SANDCASTLE_PR_SKILL_FILE || undefined) ??
    (configuredSkill as string | undefined);
  return (official ? readOfficialPRGuidance : readFinalPRGuidance)({
    skillFile,
    templateFile: options.get("--template-file") ?? "",
  });
};
