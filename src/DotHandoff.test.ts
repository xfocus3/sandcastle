import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  mkdirSync,
  chmodSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  dot,
  validateDotResponse,
  type DotRequest,
  type DotResponse,
} from "./DotHandoff.js";
import {
  captureDotSnapshot,
  snapshotIdentity,
  applyDotCommit,
} from "./DotSnapshot.js";
import type { AgentInvocation } from "./AgentProvider.js";
import { run } from "./run.js";
import { noSandbox } from "./sandboxes/no-sandbox.js";
import { Output } from "./Output.js";

const temporary: string[] = [];
afterEach(() => {
  for (const directory of temporary.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "dot-test-"));
  temporary.push(root);
  const repo = join(root, "repo");
  const origin = join(root, "origin.git");
  const git = (args: string[], cwd = repo) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  git(["init", "--bare", origin], root);
  git(["init", "-b", "main", repo], root);
  git(["config", "user.name", "Fixture"]);
  git(["config", "user.email", "fixture@example.invalid"]);
  writeFileSync(join(repo, ".gitignore"), ".sandcastle/\n");
  writeFileSync(join(repo, "Example.java"), "class Example {}\n");
  git(["add", "."]);
  git(["commit", "-m", "initial"]);
  git(["remote", "add", "origin", origin]);
  git(["push", "origin", "HEAD:main"]);
  const context: AgentInvocation = {
    prompt: "Perform the original stage",
    dangerouslySkipPermissions: false,
    cwd: repo,
    hostCwd: repo,
    worktreeCwd: repo,
    exec: async (command, stdin) => {
      const result = spawnSync("sh", ["-c", command], {
        cwd: repo,
        input: stdin,
        encoding: "utf8",
        maxBuffer: 128 * 1024 * 1024,
      });
      return {
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
        exitCode: result.status ?? 1,
      };
    },
  };
  return { root, repo, git, context };
}

function answer(request: DotRequest): DotResponse {
  return {
    id: request.id,
    requestHash: request.hash,
    runId: request.runId,
    runAttempt: request.runAttempt,
    head: request.snapshot.head,
    resultHead: request.snapshot.head,
    status: "completed",
    changedPaths: [],
    stdout: "<promise>COMPLETE</promise>",
  };
}

describe("dot handoff", () => {
  it("binds output to request, head, run and attempt and redacts host paths", async () => {
    const { root, context } = fixture();
    let captured!: DotRequest;
    const provider = dot({
      repository: "fixture/repo",
      directory: join(root, "mailbox"),
      exchange: async (request) => {
        captured = request;
        return answer(request);
      },
    });
    const result = await provider.invoke!({
      ...context,
      prompt: `Inspect ${context.cwd}/Example.java`,
    });
    expect(result.result).toBe("<promise>COMPLETE</promise>");
    expect(captured.prompt).toBe("Inspect <workspace>/Example.java");
    expect(result.sessionId).toBe(captured.sessionId);
    for (const key of [
      "id",
      "requestHash",
      "runId",
      "runAttempt",
      "head",
    ] as const) {
      expect(() =>
        validateDotResponse(captured, { ...answer(captured), [key]: "stale" }),
      ).toThrow();
    }
    expect(() =>
      validateDotResponse(captured, { ...answer(captured), status: "blocked" }),
    ).toThrow("blocked");
  });

  it("times out rather than returning success, even if an exchange ignores cancellation", async () => {
    const { root, context } = fixture();
    const provider = dot({
      repository: "fixture/repo",
      directory: join(root, "mailbox"),
      timeoutSeconds: 0.1,
      exchange: async () => new Promise(() => {}),
    });
    await expect(provider.invoke!(context)).rejects.toThrow();
  });

  it("kills snapshot child processes when cancelled rather than allowing late writes", async () => {
    const { root, repo, context } = fixture();
    const bin = join(root, "bin");
    mkdirSync(bin);
    const marker = join(repo, "late-write");
    writeFileSync(
      join(bin, "node"),
      `#!/bin/sh\nsleep 0.4\ntouch '${marker}'\n`,
    );
    chmodSync(join(bin, "node"), 0o755);
    const oldPath = process.env.PATH;
    process.env.PATH = `${bin}:${oldPath}`;
    try {
      const provider = dot({
        repository: "fixture/repo",
        directory: join(root, "mailbox"),
        timeoutSeconds: 0.1,
        exchange: async (request) => answer(request),
      });
      await expect(provider.invoke!(context)).rejects.toThrow();
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(existsSync(marker)).toBe(false);
    } finally {
      process.env.PATH = oldPath;
    }
  });

  it("replays a completed exchange after mailbox loss without asking dot twice", async () => {
    const { root, context } = fixture();
    let request!: DotRequest;
    const first = dot({
      repository: "fixture/repo",
      directory: join(root, "lost"),
      exchange: async (value) => {
        request = value;
        return answer(value);
      },
    });
    const original = await first.invoke!(context);
    rmSync(join(root, "lost"), { recursive: true });
    const resumed = dot({
      repository: "fixture/repo",
      directory: join(root, "restored"),
      replay: [{ request, response: answer(request) }],
      exchange: async () => {
        throw new Error("must not repeat completed exchange");
      },
    });
    const result = await resumed.invoke!(context);
    expect(result).toEqual(original);
  });

  it("reissues an unfinished exchange with a new request identity after expiry", async () => {
    const { root, context } = fixture();
    let request!: DotRequest;
    const first = dot({
      repository: "fixture/repo",
      directory: join(root, "lost"),
      exchange: async (value) => {
        request = value;
        throw new Error("runner lost");
      },
    });
    await expect(first.invoke!(context)).rejects.toThrow("runner lost");
    let next!: DotRequest;
    const resumed = dot({
      repository: "fixture/repo",
      directory: join(root, "new"),
      replay: [{ request }],
      exchange: async (value) => {
        next = value;
        return answer(value);
      },
    });
    await resumed.invoke!(context);
    expect(next.id).not.toBe(request.id);
    expect(next.snapshot.head).toBe(request.snapshot.head);
  });

  it("blocks replay when the original prompt or workspace no longer matches", async () => {
    const { root, context } = fixture();
    let request!: DotRequest;
    await dot({
      repository: "fixture/repo",
      directory: join(root, "first"),
      exchange: async (value) => {
        request = value;
        return answer(value);
      },
    }).invoke!(context);
    const resumed = dot({
      repository: "fixture/repo",
      directory: join(root, "new"),
      replay: [{ request, response: answer(request) }],
      exchange: async (value) => answer(value),
    });
    await expect(
      resumed.invoke!({ ...context, prompt: "Different instructions" }),
    ).rejects.toThrow("Recovery boundary changed");
  });

  it("refuses to apply a response after the worktree changes", async () => {
    const { root, repo, context } = fixture();
    const provider = dot({
      repository: "fixture/repo",
      directory: join(root, "mailbox"),
      exchange: async (request) => {
        writeFileSync(
          join(repo, "Example.java"),
          "class ChangedElsewhere {}\n",
        );
        return answer(request);
      },
    });
    await expect(provider.invoke!(context)).rejects.toThrow("stale");
    expect(readFileSync(join(repo, "Example.java"), "utf8")).toContain(
      "ChangedElsewhere",
    );
  });

  it("uses the existing structured extraction retry and same logical session", async () => {
    const { root, repo } = fixture();
    const requests: DotRequest[] = [];
    const provider = dot({
      repository: "fixture/repo",
      directory: join(root, "mailbox"),
      exchange: async (request) => {
        requests.push(request);
        return {
          ...answer(request),
          stdout:
            requests.length === 1
              ? '<output>{"count":"wrong"}</output>'
              : '<output>{"count":1}</output>',
        };
      },
    });
    const result = await run({
      cwd: repo,
      agent: provider,
      sandbox: noSandbox(),
      prompt: "Return <output> JSON </output>",
      completionSignal: "</output>",
      output: Output.object({
        tag: "output",
        schema: z.object({ count: z.number() }),
        maxRetries: 1,
      }),
    });
    expect(result.output).toEqual({ count: 1 });
    expect(requests).toHaveLength(2);
    expect(requests[1]!.resumeSession).toBe(requests[0]!.sessionId);
    expect(requests[1]!.prompt).toContain(
      "Do not change files or run commands",
    );
  });
});

describe("dot snapshots", () => {
  it("restores unpushed commits, staged and unstaged contents and untracked files", async () => {
    const { root, repo, git, context } = fixture();
    writeFileSync(join(repo, "Example.java"), "class LocalCommit {}\n");
    git(["add", "."]);
    git(["commit", "-m", "unpushed"]);
    writeFileSync(join(repo, "Example.java"), "class Staged {}\n");
    git(["add", "."]);
    writeFileSync(join(repo, "Example.java"), "class Unstaged {}\n");
    writeFileSync(join(repo, "New.java"), "class New {}\n");
    const snapshot = await captureDotSnapshot(context);
    expect(snapshot.bundle).toBeTruthy();
    const clone = join(root, "clone");
    git(["clone", "--branch", "main", join(root, "origin.git"), clone], root);
    const unsigned = { id: "fixture", snapshot };
    const file = join(root, "request.json");
    writeFileSync(
      file,
      JSON.stringify({
        ...unsigned,
        hash: createHash("sha256")
          .update(JSON.stringify(unsigned))
          .digest("hex"),
      }),
    );
    execFileSync(process.execPath, [
      resolve("scripts/dot-restore.mjs"),
      file,
      clone,
    ]);
    expect(git(["rev-parse", "HEAD"], clone)).toBe(snapshot.head);
    expect(git(["ls-files", "--stage"], clone)).toBe(
      git(["ls-files", "--stage"]),
    );
    expect(git(["diff", "--cached"], clone)).toBe(git(["diff", "--cached"]));
    expect(readFileSync(join(clone, "Example.java"), "utf8")).toBe(
      "class Unstaged {}\n",
    );
    expect(readFileSync(join(clone, "New.java"), "utf8")).toBe(
      "class New {}\n",
    );
  });

  it("preserves an unresolved merge index and merge parents", async () => {
    const { repo, git, context } = fixture();
    git(["checkout", "-b", "other"]);
    writeFileSync(join(repo, "Example.java"), "class Other {}\n");
    git(["add", "."]);
    git(["commit", "-m", "other"]);
    const other = git(["rev-parse", "HEAD"]);
    git(["checkout", "main"]);
    writeFileSync(join(repo, "Example.java"), "class Main {}\n");
    git(["add", "."]);
    git(["commit", "-m", "main"]);
    expect(() => git(["merge", "other"])).toThrow();
    const snapshot = await captureDotSnapshot(context);
    expect(snapshot.merge.MERGE_HEAD?.trim()).toBe(other);
    expect(snapshot.index).toMatch(/ 1\tExample.java/);
    expect(snapshot.index).toMatch(/ 2\tExample.java/);
    expect(snapshot.index).toMatch(/ 3\tExample.java/);
    expect(
      Buffer.from(
        snapshot.files.find((file) => file.path === "Example.java")!.data!,
        "base64",
      ).toString(),
    ).toContain("<<<<<<<");
  });

  it("rejects a result that would resurrect an unrelated staged deletion", async () => {
    const { repo, git, context } = fixture();
    writeFileSync(join(repo, "Other.java"), "class Other {}\n");
    git(["add", "."]);
    git(["commit", "-m", "second source"]);
    git(["push", "origin", "HEAD:main"]);
    const input = git(["rev-parse", "HEAD"]);
    writeFileSync(join(repo, "Other.java"), "class Changed {}\n");
    git(["add", "."]);
    git(["commit", "-m", "result"]);
    const result = git(["rev-parse", "HEAD"]);
    git(["push", "origin", "HEAD:result"]);
    git(["reset", "--hard", input]);
    git(["rm", "Example.java"]);
    const snapshot = await captureDotSnapshot(context);
    await expect(
      applyDotCommit(context, snapshot, result, ["Other.java"]),
    ).rejects.toThrow("pre-existing");
    expect(existsSync(join(repo, "Example.java"))).toBe(false);
    expect(git(["diff", "--cached", "--name-status"])).toBe("D\tExample.java");
  });

  it("applies only a published descendant and leaves unrelated heads untouched", async () => {
    const { repo, git, context } = fixture();
    const snapshot = await captureDotSnapshot(context);
    writeFileSync(join(repo, "Example.java"), "class Result {}\n");
    git(["add", "."]);
    git(["commit", "-m", "result"]);
    const result = git(["rev-parse", "HEAD"]);
    git(["push", "origin", "HEAD:result"]);
    git(["reset", "--hard", snapshot.head]);
    expect(snapshotIdentity(await captureDotSnapshot(context))).toBe(
      snapshotIdentity(snapshot),
    );
    await applyDotCommit(context, snapshot, result, ["Example.java"]);
    expect(git(["rev-parse", "HEAD"])).toBe(result);
  });
});
