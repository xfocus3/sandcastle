import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Host-owned inputs; target repository files never select the user's skill. */
export interface OfficialPRGuidanceInput {
  readonly skillFile?: string;
  readonly templateFile: string;
  readonly environment?: NodeJS.ProcessEnv;
  readonly homeDirectory?: string;
}

const selectedSkill = ({
  skillFile,
  environment = process.env,
  homeDirectory = homedir(),
}: OfficialPRGuidanceInput): string | undefined => {
  // A selected but missing/invalid source must fail, not silently use another skill.
  if (skillFile !== undefined) return skillFile;
  if (environment.SANDCASTLE_PR_SKILL_FILE)
    return environment.SANDCASTLE_PR_SKILL_FILE;
  return [
    ...(environment.CODEX_HOME
      ? [join(environment.CODEX_HOME, "skills/pr/SKILL.md")]
      : []),
    join(homeDirectory, ".agents/skills/pr/SKILL.md"),
    join(homeDirectory, ".codex/skills/pr/SKILL.md"),
  ].find((candidate) => existsSync(candidate));
};

/** Read fresh final-PR instructions; absence is optional only for generic preparation. */
const readPRGuidance = (
  input: OfficialPRGuidanceInput,
  requireSkill: boolean,
) => {
  const skillFile = selectedSkill(input);
  if (!input.templateFile || (requireSkill && !skillFile))
    throw new Error(
      "Official PR preparation requires the configured pr skill and current upstream template",
    );
  let skill: string | undefined;
  let template: string;
  try {
    if (skillFile !== undefined) skill = readFileSync(skillFile, "utf8");
    template = readFileSync(input.templateFile, "utf8");
  } catch {
    throw new Error(
      "Could not load the selected pr skill and current upstream template; no fallback description is permitted",
    );
  }
  if (
    !template.trim() ||
    (skill !== undefined &&
      (!/^name:\s*["']?pr["']?\s*$/m.test(skill) || !skill.trim()))
  )
    throw new Error(
      "PR preparation requires the selected pr skill and a nonempty upstream template",
    );
  const sha256 = (text: string) =>
    createHash("sha256").update(text).digest("hex");
  return {
    skillSha256: skill === undefined ? null : sha256(skill),
    templateSha256: sha256(template),
    prompt: [
      "# Final pull request description preparation",
      skill === undefined
        ? "No pr skill is available in this environment. Follow the current target contribution instructions and required template; do not claim that a skill was loaded."
        : "Load and follow the pr skill below for this preparation. Re-read it whenever preparing or revising the final PR description. Use its structure and the target's domain language; follow GLOSSARY.md when available.",
      "Preserve the current upstream-required issue/Jira reference, license/relicensing text and task checklist. A skill does not remove required contribution text. Use only verified revision-specific evidence and identify skipped, blocked or untested coverage. Do not substitute an internal work-PR receipt for a final description, post comments, create a PR or submit a browser form from this preparation step.",
      ...(skill === undefined ? [] : ["<pr-skill>", skill, "</pr-skill>"]),
      "<required-upstream-template>",
      template,
      "</required-upstream-template>",
    ].join("\n\n"),
  };
};

export const readFinalPRGuidance = (input: OfficialPRGuidanceInput) =>
  readPRGuidance(input, false);

/** Official Hibernate publication always requires the user's pr skill. */
export const readOfficialPRGuidance = (input: OfficialPRGuidanceInput) =>
  readPRGuidance(input, true);
