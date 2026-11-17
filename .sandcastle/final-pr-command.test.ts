import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), "final-pr-command-"));
  roots.push(root);
  const codexHome = join(root, "agent");
  const skillFile = join(codexHome, "skills/pr/SKILL.md");
  const target = join(root, "target");
  mkdirSync(join(skillFile, ".."), { recursive: true });
  mkdirSync(join(target, ".agents/skills/pr"), { recursive: true });
  writeFileSync(
    join(target, ".agents/skills/pr/SKILL.md"),
    "UNTRUSTED TARGET SKILL",
  );
  writeFileSync(
    skillFile,
    "---\nname: pr\n---\nENVIRONMENT SKILL VERSION ONE\n",
  );
  const template = join(root, "template.md");
  writeFileSync(
    template,
    "Jira reference\nRequired license/relicensing text\n- [ ] Required task\n",
  );
  const env = { ...process.env, CODEX_HOME: codexHome };
  delete env.SANDCASTLE_PR_SKILL_FILE;
  delete env.SANDCASTLE_PUBLICATION_CONFIG;
  const run = (...args: string[]) =>
    execFileSync(
      process.execPath,
      [
        fileURLToPath(
          new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url),
        ),
        fileURLToPath(
          new URL("../scripts/prepare-final-pr.ts", import.meta.url),
        ),
        "--template-file",
        template,
        ...args,
      ],
      { cwd: target, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
  return { root, skillFile, template, run };
};

it("loads and rereads the environment skill through the real final PR command", () => {
  const { skillFile, template, root, run } = fixture();
  const before = run();
  expect(before).toContain("ENVIRONMENT SKILL VERSION ONE");
  expect(before).toContain(readFileSync(template, "utf8"));
  expect(before).not.toContain("UNTRUSTED TARGET SKILL");
  expect(before).not.toContain(root);
  writeFileSync(
    skillFile,
    "---\nname: pr\n---\nENVIRONMENT SKILL VERSION TWO\n",
  );
  const after = run();
  expect(after).toContain("ENVIRONMENT SKILL VERSION TWO");
  expect(after).not.toContain("ENVIRONMENT SKILL VERSION ONE");
});

it("keeps explicit CLI selection ahead of config and automatic discovery", () => {
  const { root, run } = fixture();
  const configured = join(root, "configured.md");
  const selected = join(root, "selected.md");
  writeFileSync(configured, "---\nname: pr\n---\nCONFIGURED SKILL\n");
  writeFileSync(selected, "---\nname: pr\n---\nEXPLICIT SKILL\n");
  const config = join(root, "host.json");
  writeFileSync(config, JSON.stringify({ prSkillFile: configured }));
  expect(run("--config", config)).toContain("CONFIGURED SKILL");
  const output = run("--config", config, "--skill-file", selected);
  expect(output).toContain("EXPLICIT SKILL");
  expect(output).not.toContain("CONFIGURED SKILL");
  expect(output).not.toContain("ENVIRONMENT SKILL VERSION ONE");
});

it("rejects broken configuration rather than silently using automatic discovery", () => {
  const { root, run } = fixture();
  const config = join(root, "broken.json");
  writeFileSync(config, "{}");
  expect(() => run("--config", config)).toThrow(/requires a prSkillFile/);
});
