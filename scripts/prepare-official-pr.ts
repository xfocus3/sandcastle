import { readReviewStandards } from "../.sandcastle/review-standards";
import { preparePRGuidance } from "./pr-guidance";

// Official Hibernate preparation requires the pr skill and pinned standards.
const guidance = preparePRGuidance(process.argv.slice(2), true);
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
