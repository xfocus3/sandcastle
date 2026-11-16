import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { readOfficialPRGuidance } from "./official-pr-guidance";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "official-pr-guidance-"));
  roots.push(root);
  const skillFile = join(root, "SKILL.md");
  const templateFile = join(root, "upstream-template.md");
  writeFileSync(
    skillFile,
    "---\nname: pr\n---\n## Summary\n## Evidence\n## Merge Danger\nCurrent selected skill.\n",
  );
  writeFileSync(
    templateFile,
    "Jira: HHH-EXAMPLE\nRequired license and relicensing wording.\n- [ ] Required task\n",
  );
  return { skillFile, templateFile };
};

it("loads the selected skill and retains upstream-required text exactly", () => {
  const input = fixture();
  const result = readOfficialPRGuidance(input);
  expect(result.prompt).toContain(readFileSync(input.skillFile, "utf8"));
  expect(result.prompt).toContain(readFileSync(input.templateFile, "utf8"));
  expect(result.prompt).toContain("Before/After");
  expect(result.prompt).toContain("Door and Blast Radius");
  expect(result.prompt).not.toContain(input.skillFile);
  expect(result.skillSha256).toMatch(/^[a-f0-9]{64}$/);
});

it("rereads the skill at each preparation instead of caching an earlier copy", () => {
  const input = fixture();
  const before = readOfficialPRGuidance(input);
  writeFileSync(
    input.skillFile,
    "---\nname: pr\n---\nUpdated selected skill instructions.\n",
  );
  const after = readOfficialPRGuidance(input);
  expect(after.prompt).toContain("Updated selected skill instructions.");
  expect(after.skillSha256).not.toBe(before.skillSha256);
  expect(after.templateSha256).toBe(before.templateSha256);
});

it("fails before drafting when the selected skill is unavailable", () => {
  const input = fixture();
  rmSync(input.skillFile);
  expect(() => readOfficialPRGuidance(input)).toThrow(
    /no fallback description is permitted/,
  );
});

it("rejects an empty required template or a different skill", () => {
  const input = fixture();
  writeFileSync(input.templateFile, "");
  expect(() => readOfficialPRGuidance(input)).toThrow(
    /nonempty upstream template/,
  );
  writeFileSync(input.templateFile, "Required template");
  writeFileSync(input.skillFile, "---\nname: another-skill\n---\n");
  expect(() => readOfficialPRGuidance(input)).toThrow(/selected pr skill/);
});
