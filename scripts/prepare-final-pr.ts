import { preparePRGuidance } from "./pr-guidance";

// Local preparation only. The caller reads these instructions before drafting.
const guidance = preparePRGuidance(process.argv.slice(2));
console.error(
  `[final-pr-guidance] skill_sha256=${guidance.skillSha256 ?? "unavailable"} template_sha256=${guidance.templateSha256}`,
);
console.log(guidance.prompt);
