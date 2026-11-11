import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";

const directories: string[] = [];
const script = fileURLToPath(new URL("./update-branch.ts", import.meta.url));
const tsx = fileURLToPath(
  new URL("../../../node_modules/tsx/dist/cli.mjs", import.meta.url),
);
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "branch-update-"));
  directories.push(directory);
  const origin = join(directory, "origin");
  const target = join(directory, "target");
  const output = join(directory, "output");
  git(directory, "init", "-b", "main", origin);
  git(origin, "config", "user.name", "Sandcastle Test");
  git(origin, "config", "user.email", "sandcastle-test@example.invalid");
  writeFileSync(join(origin, "base.txt"), "base\n");
  git(origin, "add", "base.txt");
  git(origin, "commit", "-m", "Initial base");
  git(directory, "clone", "--no-local", origin, target);
  git(target, "config", "user.name", "Sandcastle Test");
  git(target, "config", "user.email", "sandcastle-test@example.invalid");
  git(target, "checkout", "-b", "topic");
  return { origin, target, output };
}

function commit(cwd: string, filename: string, content: string) {
  writeFileSync(join(cwd, filename), content);
  git(cwd, "add", filename);
  git(cwd, "commit", "-m", `Update ${filename}`);
  return git(cwd, "rev-parse", "HEAD");
}

function run(target: string, output: string) {
  return spawnSync(process.execPath, [tsx, script], {
    cwd: target,
    env: {
      ...process.env,
      PR_NUMBER: "1",
      BRANCH: "topic",
      BASE_REF: "main",
      OUTPUT_DIR: output,
    },
    encoding: "utf8",
    timeout: 15000,
  });
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("blocks cleanly divergent histories without creating a merge commit", () => {
  const { origin, target, output } = fixture();
  const head = commit(target, "feature.txt", "feature\n");
  commit(origin, "upstream.txt", "upstream\n");

  const result = run(target, output);

  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(1);
  expect(git(target, "rev-parse", "HEAD")).toBe(head);
  expect(git(target, "status", "--porcelain")).toBe("");
  expect(readFileSync(join(output, "should_push.txt"), "utf8")).toBe("false");
  expect(readFileSync(join(output, "failure_reason.txt"), "utf8")).toMatch(
    /diverg|contribution/i,
  );
});
