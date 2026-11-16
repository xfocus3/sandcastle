import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/** Publication-host inputs; never infer a private skill path from a target repository. */
export interface OfficialPRGuidanceInput {
  readonly skillFile: string;
  readonly templateFile: string;
}

/** Load fresh instructions and preserve the selected upstream template verbatim. No publishing occurs. */
export const readOfficialPRGuidance = ({
  skillFile,
  templateFile,
}: OfficialPRGuidanceInput) => {
  if (!skillFile || !templateFile)
    throw new Error(
      "Official PR preparation requires the configured pr skill and current upstream template",
    );
  let skill: string;
  let template: string;
  try {
    skill = readFileSync(skillFile, "utf8");
    template = readFileSync(templateFile, "utf8");
  } catch {
    throw new Error(
      "Could not load the configured pr skill and current upstream template; no fallback description is permitted",
    );
  }
  if (
    !/^name:\s*["']?pr["']?\s*$/m.test(skill) ||
    !skill.trim() ||
    !template.trim()
  ) {
    throw new Error(
      "Official PR preparation requires the selected pr skill and a nonempty upstream template",
    );
  }
  const sha256 = (text: string) =>
    createHash("sha256").update(text).digest("hex");
  return {
    skillSha256: sha256(skill),
    templateSha256: sha256(template),
    prompt: [
      "# Official Hibernate PR description preparation",
      "Load and follow the pr skill below for this preparation. Use Summary with the smallest useful visual, Evidence with concrete Before/After, and Merge Danger with Door and Blast Radius. Keep domain prose brief and follow the target GLOSSARY.md when available.",
      "Preserve the current upstream-required Jira reference, license/relicensing text and task checklist. The skill structures the description; it does not remove required contribution text. Use only verified revision-specific evidence and identify skipped, blocked or untested coverage. Do not substitute the internal work-PR template, post comments, create a PR or submit a browser form from this preparation step.",
      "<pr-skill>",
      skill,
      "</pr-skill>",
      "<required-upstream-template>",
      template,
      "</required-upstream-template>",
    ].join("\n\n"),
  };
};
