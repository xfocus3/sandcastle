import { readFileSync } from "node:fs";

// Resolve against the pinned tool checkout, never the target repository's cwd.
export const readReviewStandards = (): string =>
  readFileSync(new URL("./CODING_STANDARDS.md", import.meta.url), "utf8");
