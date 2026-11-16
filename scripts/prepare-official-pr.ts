import { readFileSync } from "node:fs";
import { readReviewStandards } from "../.sandcastle/review-standards";
import { readOfficialPRGuidance } from "../.sandcastle/official-pr-guidance";

// Local preparation only. The caller reads the resulting instructions before drafting.
const args = process.argv.slice(2);
const options = new Map<string, string>();
for (let i = 0; i < args.length; i += 2) {
  const name = args[i];
  const value = args[i + 1];
  if (
    !["--config", "--skill-file", "--template-file"].includes(name ?? "") ||
    !value ||
    options.has(name!)
  ) {
    throw new Error(
      "Use --template-file and either --skill-file or --config for official PR preparation",
    );
  }
  options.set(name!, value);
}
const configFile =
  options.get("--config") ?? process.env.SANDCASTLE_PUBLICATION_CONFIG;
let configuredSkill: unknown;
if (configFile) {
  try {
    configuredSkill = JSON.parse(readFileSync(configFile, "utf8")).prSkillFile;
  } catch {
    throw new Error("Could not read the publication host configuration");
  }
}
const skillFile =
  options.get("--skill-file") ??
  process.env.SANDCASTLE_PR_SKILL_FILE ??
  configuredSkill;
if (typeof skillFile !== "string")
  throw new Error(
    "Configure the user's pr skill before official PR preparation",
  );
const guidance = readOfficialPRGuidance({
  skillFile,
  templateFile: options.get("--template-file") ?? "",
});
console.error(
  `[official-pr-guidance] skill_sha256=${guidance.skillSha256} template_sha256=${guidance.templateSha256}`,
);
console.log(
  readReviewStandards({
    repository: "hibernate/hibernate-orm",
    upstreamRepository: "hibernate/hibernate-orm",
  }),
);
console.log(guidance.prompt);
