// Recovery wrapper around an original stage script, not a replacement stage engine.
// Only the coordinator publishes durable recovery records; JSON grants no authority.
import { createHash, randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DefaultArtifactClient } from "@actions/artifact";
import { captureDotSnapshot } from "../../src/DotSnapshot.js";

import {
  dotStageScripts as scripts,
  validateDotRecovery,
  reconcileDotRecovery,
  type DotStageInput,
  type DotRecoveryRecord,
} from "../../src/DotRecovery.js";

const keys = [
  "ISSUE_NUMBER",
  "ISSUE_TITLE",
  "PR_NUMBER",
  "BRANCH",
  "BASE_REF",
  "GH_REPO",
  "SANDCASTLE_DOT_RESPONSE_REF",
];
const git = (...args: string[]) =>
  execFileSync("git", args, { encoding: "utf8" }).trim();
const hash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const controllerPaths = [
  "src",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "tsup.config.ts",
  "scripts",
  ".sandcastle/agent-workflows",
  ".github/workflows",
];
const toolRoot = resolve(import.meta.dirname, "../..");
const externalTarget = toolRoot !== process.cwd();
const controllerHash = () =>
  externalTarget
    ? hash({
        tool: git("-C", toolRoot, "ls-tree", "-r", "HEAD", "--", ...controllerPaths),
        workflows: git("ls-tree", "-r", "HEAD", "--", ".github/workflows"),
      })
    : hash(git("ls-tree", "-r", "HEAD", "--", ...controllerPaths));
const handoffRoot = externalTarget
  ? resolve(git("rev-parse", "--git-path", "sandcastle-dot"))
  : resolve(".sandcastle/dot");
if (externalTarget) process.env.SANDCASTLE_DOT_DIRECTORY = handoffRoot;
const directory = join(handoffRoot, "stage");
mkdirSync(directory, { recursive: true });
let script = process.argv[2];
let replay: unknown;
let stage: DotStageInput;

async function api(path: string, missingOkay = false) {
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  const response = await fetch(
    `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/${path}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal: AbortSignal.timeout(30000),
    },
  );
  if (missingOkay && response.status === 404) return undefined;
  if (!response.ok)
    throw new Error(`Recovery reconciliation failed (${response.status})`);
  return response.json();
}

if (script === "--resume") {
  const record = JSON.parse(
    readFileSync(process.argv[3]!, "utf8"),
  ) as DotRecoveryRecord;
  stage = record.stage;
  validateDotRecovery(record, process.env.GITHUB_REPOSITORY ?? "");
  // Reconciliation is the first remote action; an active runner owns its wait.
  const oldRun = await api(`actions/runs/${stage.runId}`);
  const ref = await api(`git/ref/${record.lease.ref.slice(5)}`, true);
  reconcileDotRecovery(
    record,
    oldRun,
    ref?.object.sha ?? null,
    controllerHash(),
  );
  const pending = record.exchanges.at(-1);
  if (pending && pending.request.runId !== stage.runId) {
    if (!/^\d+$/.test(pending.request.runId))
      throw new Error("Invalid exchange owner run");
    const owner = await api(`actions/runs/${pending.request.runId}`);
    if (
      owner.status !== "completed" ||
      String(owner.run_attempt) !== pending.request.runAttempt ||
      owner.head_sha !== pending.request.controllerHead
    )
      throw new Error(
        "A newer runner owns this exchange; reconcile before replaying",
      );
  }
  if (pending && !pending.response) {
    if (!/^[a-zA-Z0-9-]+$/.test(pending.request?.id))
      throw new Error("Invalid pending exchange");
    const responseRef =
      stage.env.SANDCASTLE_DOT_RESPONSE_REF ?? "sandcastle-dot-responses";
    const saved = await api(
      `contents/responses/${pending.request.id}.json?ref=${encodeURIComponent(responseRef)}`,
      true,
    );
    if (saved) {
      if (saved.encoding !== "base64" || !saved.content)
        throw new Error("Invalid saved response file");
      pending.response = JSON.parse(
        Buffer.from(saved.content, "base64").toString("utf8"),
      );
    }
  }
  replay = record.exchanges;
  script = stage.script;
  const request = { id: stage.id, snapshot: stage.snapshot };
  const file = join(directory, "restore.json");
  writeFileSync(file, JSON.stringify({ ...request, hash: hash(request) }));
  execFileSync(
    process.execPath,
    [join(toolRoot, "scripts/dot-restore.mjs"), file, process.cwd()],
    { stdio: "inherit" },
  );
  for (const key of keys) {
    if (stage.env[key] !== undefined) process.env[key] = stage.env[key];
    else delete process.env[key];
  }
  if (stage.batch !== undefined) {
    const file = join(directory, "issues.json");
    writeFileSync(file, stage.batch);
    process.env.ISSUES_FILE = file;
  }
  const journalFile = join(directory, "replay.json");
  writeFileSync(journalFile, JSON.stringify(replay));
  process.env.SANDCASTLE_DOT_REPLAY_FILE = journalFile;
} else {
  if (!script || !scripts.has(script))
    throw new Error("Choose an original supported stage script");
  const refs = script.endsWith("/explore.ts")
    ? []
    : script.endsWith("/update-branch.ts") && process.env.BASE_REF
    ? [`origin/${process.env.BASE_REF}`]
    : ["main", ...(process.env.BASE_REF ? [`origin/${process.env.BASE_REF}`] : [])];
  const snapshot = await captureDotSnapshot(
    {
      prompt: "",
      dangerouslySkipPermissions: false,
      cwd: process.cwd(),
      hostCwd: process.cwd(),
      worktreeCwd: process.cwd(),
      exec: async (command, input) => {
        try {
          return {
            stdout: execFileSync("sh", ["-c", command], {
              input,
              encoding: "utf8",
              timeout: 60000,
              maxBuffer: 128 * 1024 * 1024,
            }),
            stderr: "",
            exitCode: 0,
          };
        } catch {
          throw new Error("Stage input snapshot failed");
        }
      },
    },
    refs,
  );
  const unsigned = {
    version: 1 as const,
    id: randomUUID(),
    script,
    repository: process.env.GITHUB_REPOSITORY ?? "",
    workflowHead: process.env.GITHUB_SHA ?? git("rev-parse", "HEAD"),
    controllerHash: controllerHash(),
    runId: process.env.GITHUB_RUN_ID ?? "local",
    runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? "1",
    env: Object.fromEntries(
      keys
        .filter((key) => process.env[key] !== undefined)
        .map((key) => [key, process.env[key]!]),
    ),
    ...(process.env.ISSUES_FILE
      ? { batch: readFileSync(process.env.ISSUES_FILE, "utf8") }
      : {}),
    snapshot,
  };
  stage = { ...unsigned, hash: hash(unsigned) };
  const file = join(directory, "input.json");
  writeFileSync(file, JSON.stringify(stage, null, 2));
  if (process.env.GITHUB_ACTIONS === "true") {
    const { id } = await new DefaultArtifactClient().uploadArtifact(
      `dot-stage-input-${stage.id}`,
      [file],
      directory,
      { retentionDays: 7 },
    );
    console.log(`Stage input checkpoint ${stage.id}, artifact ${id}`);
  }
}
process.env.SANDCASTLE_DOT_STAGE = JSON.stringify({
  id: stage.id,
  inputHash: stage.hash,
  script,
});
const code = await new Promise<number>((done, fail) => {
  const child = spawn(process.execPath, [join(toolRoot, "node_modules/tsx/dist/cli.mjs"), resolve(toolRoot, script!)], {
    stdio: "inherit",
    env: process.env,
  });
  child.on("error", fail);
  child.on("close", (code) => done(code ?? 1));
});
if (code === 0 && Array.isArray(replay)) {
  const used =
    replay.length === 0
      ? 0
      : Number(
          readFileSync(
            `${process.env.SANDCASTLE_DOT_REPLAY_FILE}.used`,
            "utf8",
          ),
        );
  if (used !== replay.length)
    throw new Error(
      "Original stage did not consume its complete recovery journal",
    );
}
writeFileSync(
  join(directory, "status.json"),
  JSON.stringify({
    stageId: stage.id,
    runId: process.env.GITHUB_RUN_ID,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT,
    head: git("rev-parse", "HEAD"),
    status: code === 0 ? "stage_returned" : "blocked",
    externalEffects: "coordinator_must_reconcile",
  }),
);
process.exitCode = code;
