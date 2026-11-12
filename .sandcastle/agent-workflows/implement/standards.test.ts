import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Ref } from "effect";
import { expect, it } from "vitest";
import { SilentDisplay } from "../../../src/Display.js";
import { substitutePromptArgs } from "../../../src/PromptArgumentSubstitution.js";
import { readReviewStandards } from "../../review-standards";

it("loads pinned tool standards independently of the target repository", () => {
  const cwd = process.cwd();
  const target = mkdtempSync(join(tmpdir(), "implementation-standards-"));
  try {
    process.chdir(target);
    const expected = readFileSync(
      new URL("../../CODING_STANDARDS.md", import.meta.url),
      "utf8",
    );
    expect(readReviewStandards()).toBe(expected);
    mkdirSync(".sandcastle");
    writeFileSync(
      ".sandcastle/CODING_STANDARDS.md",
      "target-specific guidance",
    );
    expect(readReviewStandards()).toBe(expected);
  } finally {
    process.chdir(cwd);
    rmSync(target, { recursive: true, force: true });
  }
});

for (const stage of ["implement", "implement-pr"]) {
  it(`embeds standards into the ${stage} prompt and wires its invocation`, async () => {
    const source = readFileSync(
      new URL(`../${stage}/${stage}.ts`, import.meta.url),
      "utf8",
    );
    expect(source).toContain(
      'import { readReviewStandards } from "../../review-standards"',
    );
    expect(source).toMatch(
      /promptArgs: \{\s*SANDCASTLE_CODING_STANDARDS: readReviewStandards\(\)/,
    );
    const prompt = readFileSync(
      new URL(`../${stage}/prompt.md`, import.meta.url),
      "utf8",
    );
    const args = Object.fromEntries(
      [...prompt.matchAll(/\{\{([A-Z_]+)\}\}/g)].map((match) => [
        match[1]!,
        "context",
      ]),
    );
    args.SANDCASTLE_CODING_STANDARDS = readReviewStandards();
    const rendered = await Effect.runPromise(
      substitutePromptArgs(prompt, args).pipe(
        Effect.provide(SilentDisplay.layer(Ref.unsafeMake([]))),
      ),
    );
    expect(rendered).toContain(readReviewStandards());
    expect(rendered).toContain("Respect target-branch formatting rules");
    expect(rendered).toContain("Prove publication matches verification");
    expect(rendered).not.toContain("{{SANDCASTLE_CODING_STANDARDS}}");
  });
}

it("includes standards in the recovery controller fingerprint", () => {
  const source = readFileSync(
    new URL("../../../scripts/dot/stage.ts", import.meta.url),
    "utf8",
  );
  expect(source).toContain('".sandcastle/CODING_STANDARDS.md"');
  expect(source).toContain('".sandcastle/review-standards.ts"');
});
