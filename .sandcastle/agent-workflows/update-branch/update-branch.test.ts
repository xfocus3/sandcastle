import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
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

function run(
  target: string,
  output: string,
  overrides: Record<string, string> = {},
) {
  return spawnSync(process.execPath, [tsx, script], {
    cwd: target,
    env: {
      ...process.env,
      PR_NUMBER: "1",
      BRANCH: "topic",
      BASE_REF: "main",
      OUTPUT_DIR: output,
      ...overrides,
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

it.each([false, true])(
  "keeps an already-current branch unchanged (ahead: %s)",
  (ahead) => {
    const { target, output } = fixture();
    if (ahead) commit(target, "feature.txt", "feature\n");
    const head = git(target, "rev-parse", "HEAD");
    mkdirSync(output);
    writeFileSync(join(output, "should_push.txt"), "true");
    writeFileSync(join(output, "comment.md"), "stale publication");
    writeFileSync(join(output, "failure_reason.txt"), "stale failure");

    const result = run(target, output);

    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    expect(git(target, "rev-parse", "HEAD")).toBe(head);
    expect(readFileSync(join(output, "should_push.txt"), "utf8")).toBe("false");
    expect(readFileSync(join(output, "comment.md"), "utf8")).toContain(
      "already up to date",
    );
    expect(existsSync(join(output, "failure_reason.txt"))).toBe(false);
  },
);

it("fast-forwards to the existing base commit without synthesizing a commit", () => {
  const { origin, target, output } = fixture();
  const head = git(target, "rev-parse", "HEAD");
  const base = commit(origin, "upstream.txt", "upstream\n");

  const result = run(target, output);

  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);
  expect(git(target, "rev-parse", "HEAD")).toBe(base);
  expect(git(target, "rev-list", "--merges", `${head}..HEAD`)).toBe("");
  expect(git(target, "status", "--porcelain")).toBe("");
  expect(readFileSync(join(target, "upstream.txt"), "utf8")).toBe("upstream\n");
  expect(readFileSync(join(output, "should_push.txt"), "utf8")).toBe("true");
  expect(readFileSync(join(output, "comment.md"), "utf8")).toContain(
    "fast-forwarded",
  );
});

it("blocks conflicting divergence before leaving merge state or invoking an agent", () => {
  const { origin, target, output } = fixture();
  const head = commit(target, "base.txt", "feature\n");
  commit(origin, "base.txt", "upstream\n");

  const result = run(target, output);

  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(1);
  expect(git(target, "rev-parse", "HEAD")).toBe(head);
  expect(git(target, "status", "--porcelain")).toBe("");
  expect(readFileSync(join(target, "base.txt"), "utf8")).toBe("feature\n");
  expect(
    existsSync(
      join(target, git(target, "rev-parse", "--git-path", "MERGE_HEAD")),
    ),
  ).toBe(false);
  expect(readFileSync(join(output, "failure_reason.txt"), "utf8")).toContain(
    "histories have diverged",
  );
  expect(readFileSync(join(output, "should_push.txt"), "utf8")).toBe("false");
  expect(existsSync(join(output, "comment.md"))).toBe(false);
});

it("preserves dirty work and clears stale publication output instead of fast-forwarding", () => {
  const { origin, target, output } = fixture();
  const head = git(target, "rev-parse", "HEAD");
  commit(origin, "upstream.txt", "upstream\n");
  writeFileSync(join(target, "base.txt"), "uncommitted\n");
  const status = git(target, "status", "--porcelain");
  mkdirSync(output);
  writeFileSync(join(output, "should_push.txt"), "true");
  writeFileSync(join(output, "comment.md"), "stale publication");

  const result = run(target, output);

  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(1);
  expect(git(target, "rev-parse", "HEAD")).toBe(head);
  expect(git(target, "status", "--porcelain")).toBe(status);
  expect(readFileSync(join(target, "base.txt"), "utf8")).toBe("uncommitted\n");
  expect(readFileSync(join(output, "should_push.txt"), "utf8")).toBe("false");
  expect(existsSync(join(output, "comment.md"))).toBe(false);
  expect(readFileSync(join(output, "failure_reason.txt"), "utf8")).toContain(
    "not clean",
  );
});

it("fails closed when the requested base cannot be fetched", () => {
  const { target, output } = fixture();
  const head = git(target, "rev-parse", "HEAD");

  const result = run(target, output, { BASE_REF: "missing" });

  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(1);
  expect(git(target, "rev-parse", "HEAD")).toBe(head);
  expect(git(target, "status", "--porcelain")).toBe("");
  expect(readFileSync(join(output, "should_push.txt"), "utf8")).toBe("false");
  expect(existsSync(join(output, "comment.md"))).toBe(false);
});

it("does not disturb an existing Git operation", () => {
  const { target, output } = fixture();
  const head = git(target, "rev-parse", "HEAD");
  const state = join(
    target,
    git(target, "rev-parse", "--git-path", "MERGE_HEAD"),
  );
  writeFileSync(state, `${head}\n`);

  const result = run(target, output);

  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(1);
  expect(git(target, "rev-parse", "HEAD")).toBe(head);
  expect(readFileSync(state, "utf8")).toBe(`${head}\n`);
  expect(readFileSync(join(output, "should_push.txt"), "utf8")).toBe("false");
  expect(readFileSync(join(output, "failure_reason.txt"), "utf8")).toContain(
    "already in progress",
  );
});

it("rejects a checkout that no longer matches the requested source branch", () => {
  const { target, output } = fixture();
  const head = git(target, "rev-parse", "HEAD");

  const result = run(target, output, { BRANCH: "different" });

  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(1);
  expect(git(target, "rev-parse", "HEAD")).toBe(head);
  expect(readFileSync(join(output, "should_push.txt"), "utf8")).toBe("false");
});

it("retains workflow failure cleanup and only uses ordinary fast-forward pushes", () => {
  for (const name of [
    "agent-update-branch.yml",
    "agent-update-branch-target.yml",
  ]) {
    const workflow = readFileSync(
      new URL(`../../../.github/workflows/${name}`, import.meta.url),
      "utf8",
    );
    expect(workflow).toContain("if: failure()");
    expect(workflow).toContain('--add-label "agent:blocked"');
    expect(workflow).toContain("if: always()");
    expect(workflow).toContain('--remove-label "agent:in-progress"');
    expect(workflow).toContain('push origin "$BRANCH"');
    expect(workflow).not.toContain("push --force");
    expect(workflow).toContain('git checkout -B "$BRANCH" "$BRANCH_HEAD_SHA"');
    expect(workflow).not.toContain("git branch --force main");
    expect(workflow).toContain(
      "Divergent histories require a separately authorized update.",
    );
  }
});
