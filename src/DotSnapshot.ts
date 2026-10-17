import { createHash } from "node:crypto";
import type { AgentInvocation } from "./AgentProvider.js";

export interface DotSnapshot {
  head: string;
  branch: string;
  refs: string;
  taskRefs: readonly string[];
  index: string;
  indexObjects: string;
  bundle?: string;
  merge: Record<string, string>;
  files: { path: string; mode: number; data?: string; link?: string }[];
}

const quote = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`;

// This function is sent to the existing sandbox, so it must stay self-contained.
// The index is serialized as mode/object/stage/path, never raw machine stat data.
const captureScript = String.raw`
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const cp = await import("node:child_process");
  const git = (...args) => cp.execFileSync("git", args, { maxBuffer: 128 * 1024 * 1024 });
  const text = (...args) => git(...args).toString("utf8").trim();
  const extraRefs = JSON.parse(fs.readFileSync(0, "utf8") || "[]");
  for (const ref of extraRefs) {
    if (typeof ref !== "string" || ref.startsWith("-")) throw new Error("Invalid task ref");
    git("rev-parse", "--verify", ref + "^{commit}");
  }
  for (const state of ["rebase-apply", "rebase-merge", "sequencer", "MERGE_AUTOSTASH", "BISECT_START"]) {
    if (fs.existsSync(text("rev-parse", "--git-path", state))) throw new Error("Unsupported Git operation in progress: " + state);
  }
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sandcastle-dot-"));
  try {
    const index = git("ls-files", "--stage", "-z").toString("utf8");
    if (index.split("\0").some(entry => entry.startsWith("160000 "))) throw new Error("Submodule snapshots require a separate scoped handoff");
    const objects = [...new Set(index.split("\0").filter(Boolean).map(entry => entry.split(" ")[1]))];
    const indexObjects = cp.execFileSync("git", ["pack-objects", "--stdout"], {
      input: objects.join("\n") + "\n", maxBuffer: 128 * 1024 * 1024,
    }).toString("base64");
    const changed = new Set([
      ...git("diff", "--name-only", "-z", "HEAD").toString("utf8").split("\0"),
      ...git("diff", "--cached", "--name-only", "-z").toString("utf8").split("\0"),
      ...git("ls-files", "--others", "--exclude-standard", "-z").toString("utf8").split("\0"),
    ].filter(Boolean));
    const files = [...changed].sort().map(file => {
      if (/(^|\/)(\.env(?:\..*)?|id_rsa|id_ed25519|credentials(?:\.json)?|\.aws|\.ssh|\.codex)(\/|$)/i.test(file)) {
        throw new Error("Snapshot contains a potentially private file; exclude it before handoff");
      }
      let stat;
      try { stat = fs.lstatSync(file); } catch { return { path: file, mode: 0 }; }
      if (stat.isSymbolicLink()) {
        const link = fs.readlinkSync(file);
        const target = path.resolve(path.dirname(file), link);
        if (path.isAbsolute(link) || !target.startsWith(process.cwd() + path.sep)) throw new Error("Snapshot symlink escapes the repository");
        return { path: file, mode: stat.mode, link };
      }
      if (!stat.isFile()) throw new Error("Snapshot only supports ordinary files and symlinks");
      return { path: file, mode: stat.mode, data: fs.readFileSync(file).toString("base64") };
    });
    const merge = {};
    for (const name of ["MERGE_HEAD", "MERGE_MSG", "MERGE_MODE", "CHERRY_PICK_HEAD", "REVERT_HEAD"]) {
      const file = text("rev-parse", "--git-path", name);
      if (fs.existsSync(file)) merge[name] = fs.readFileSync(file, "utf8");
    }
    const taskRefs = ["HEAD", ...extraRefs, ...(merge.MERGE_HEAD?.trim().split(/\s+/) ?? [])];
    let bundle;
    if (text("rev-list", ...taskRefs, "--not", "--remotes=origin")) {
      const file = path.join(directory, "commits.bundle");
      git("bundle", "create", file, ...taskRefs, "--not", "--remotes=origin");
      bundle = fs.readFileSync(file).toString("base64");
    }
    process.stdout.write(JSON.stringify({
      head: text("rev-parse", "HEAD"),
      branch: text("rev-parse", "--abbrev-ref", "HEAD"),
      refs: ["HEAD", ...extraRefs].map(ref => text("rev-parse", ref) + " " + text("rev-parse", "--symbolic-full-name", ref)).join("\n"),
      taskRefs: extraRefs, index, indexObjects, bundle, merge, files,
    }));
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
`;

export async function captureDotSnapshot(
  context: AgentInvocation,
  refs: readonly string[] = [],
): Promise<DotSnapshot> {
  context.signal?.throwIfAborted();
  const result = await context.exec(
    `node --input-type=module -e ${quote(captureScript)}`,
    JSON.stringify(refs),
  );
  context.signal?.throwIfAborted();
  if (result.exitCode !== 0)
    throw new Error("Could not capture the complete dot worktree snapshot");
  return JSON.parse(result.stdout) as DotSnapshot;
}

export function snapshotIdentity(snapshot: DotSnapshot): string {
  const { head, branch, refs, index, merge, files } = snapshot;
  return createHash("sha256")
    .update(JSON.stringify({ head, branch, refs, index, merge, files }))
    .digest("hex");
}

export async function applyDotCommit(
  context: AgentInvocation,
  snapshot: DotSnapshot,
  head: string,
  changedPaths: readonly string[] = [],
): Promise<void> {
  if (!/^[0-9a-f]{40}$/.test(head))
    throw new Error("Invalid dot result commit");
  if (
    snapshotIdentity(await captureDotSnapshot(context, snapshot.taskRefs)) !==
    snapshotIdentity(snapshot)
  ) {
    throw new Error(
      "Worktree changed while dot was working; response is stale",
    );
  }
  if (head === snapshot.head) {
    if (changedPaths.length)
      throw new Error("Changed paths do not match the result commit");
    return;
  }
  const parents = [
    snapshot.head,
    ...(snapshot.merge.MERGE_HEAD?.trim().split(/\s+/) ?? []),
  ];
  const commands = [
    `git fetch origin ${head}`,
    ...parents.map(
      (parent) => `git merge-base --is-ancestor ${quote(parent)} ${head}`,
    ),
  ];
  for (const command of commands) {
    context.signal?.throwIfAborted();
    const result = await context.exec(command);
    if (result.exitCode !== 0)
      throw new Error("Dot result could not be applied to the pinned worktree");
    context.signal?.throwIfAborted();
  }
  const diff = await context.exec(
    `git diff --name-only -z ${snapshot.head} ${head}`,
  );
  const actualPaths = diff.stdout.split("\0").filter(Boolean).sort();
  if (
    diff.exitCode !== 0 ||
    JSON.stringify(actualPaths) !== JSON.stringify([...changedPaths].sort())
  ) {
    throw new Error("Changed paths do not match the result commit");
  }
  for (const file of snapshot.files.filter(
    (file) => !actualPaths.includes(file.path),
  )) {
    const tracked = await context.exec(
      `git ls-files --error-unmatch -- ${quote(file.path)}`,
    );
    const inHead = await context.exec(
      `git cat-file -e ${quote(`${snapshot.head}:${file.path}`)}`,
    );
    if (tracked.exitCode === 0 || inHead.exitCode === 0)
      throw new Error(
        "Result would discard pre-existing worktree changes; reconcile them before applying",
      );
  }
  if (
    snapshotIdentity(await captureDotSnapshot(context, snapshot.taskRefs)) !==
    snapshotIdentity(snapshot)
  ) {
    throw new Error("Worktree changed before result application");
  }
  context.signal?.throwIfAborted();
  const reset = await context.exec(`git reset --hard ${head}`);
  context.signal?.throwIfAborted();
  if (reset.exitCode !== 0)
    throw new Error("Could not apply the dot result commit");
}
