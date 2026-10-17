import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import type { AgentInvocation, AgentProvider } from "./AgentProvider.js";
import {
  applyDotCommit,
  captureDotSnapshot,
  snapshotIdentity,
  type DotSnapshot,
} from "./DotSnapshot.js";

export interface DotRequest {
  version: 1;
  id: string;
  repository: string;
  runId: string;
  runAttempt: string;
  controllerHead?: string;
  prompt: string;
  resumeSession?: string;
  forkSession: boolean;
  sessionId: string;
  expiresAt: string;
  snapshot: DotSnapshot;
  hash: string;
  stage?: { id: string; inputHash: string; script: string };
}

export interface DotResponse {
  id: string;
  requestHash: string;
  runId: string;
  runAttempt: string;
  head: string;
  resultHead: string;
  changedPaths: string[];
  status: "completed" | "blocked";
  stdout: string;
}

export interface DotExchange {
  request: DotRequest;
  response?: DotResponse;
}

interface ReplayState {
  entries: readonly DotExchange[];
  cursor: number;
}
const replayFiles = new Map<string, Promise<ReplayState>>();
async function replayFile(file: string): Promise<ReplayState> {
  let state = replayFiles.get(file);
  if (!state) {
    state = readFile(file, "utf8").then((text) => {
      const value = JSON.parse(text);
      if (
        !Array.isArray(value) ||
        value.some(
          (entry, index) =>
            !entry?.request || (!entry.response && index !== value.length - 1),
        )
      )
        throw new Error("Invalid dot replay journal");
      return { entries: value, cursor: 0 };
    });
    replayFiles.set(file, state);
  }
  return state;
}

function replayMatches(previous: DotRequest, current: DotRequest): boolean {
  const { hash, ...unsigned } = previous;
  if (
    createHash("sha256").update(JSON.stringify(unsigned)).digest("hex") !== hash
  ) {
    throw new Error("Recovery request hash mismatch");
  }
  return (
    previous.repository === current.repository &&
    previous.prompt === current.prompt &&
    previous.resumeSession === current.resumeSession &&
    previous.forkSession === current.forkSession &&
    JSON.stringify(previous.stage ?? null) ===
      JSON.stringify(current.stage ?? null) &&
    snapshotIdentity(previous.snapshot) === snapshotIdentity(current.snapshot)
  );
}

export interface DotOptions {
  /** Same GitHub repository as the worktree. Defaults to GITHUB_REPOSITORY or the GitHub origin. */
  repository?: string;
  /** Coordinator-owned response branch; response files never select a remote. */
  responseRef?: string;
  /** Local mailbox and sanitized session records. */
  directory?: string;
  /** Additional branches explicitly needed by this stage (for example merger inputs). */
  refs?: readonly string[];
  /** Hard wait bound, at most 45 minutes; expiry is an error, never completion. */
  timeoutSeconds?: number;
  /** Completed exchanges replay only at the exact original prompt/worktree boundary. */
  replay?: readonly DotExchange[];
  /** Transport seam for a coordinator or deterministic protocol tests. */
  exchange?: (request: DotRequest, signal: AbortSignal) => Promise<DotResponse>;
}

export function validateDotResponse(
  request: DotRequest,
  value: unknown,
): DotResponse {
  if (typeof value !== "object" || value === null)
    throw new Error("Invalid dot response");
  const response = value as DotResponse;
  if (
    response.id !== request.id ||
    response.requestHash !== request.hash ||
    response.runId !== request.runId ||
    response.runAttempt !== request.runAttempt ||
    response.head !== request.snapshot.head
  ) {
    throw new Error(
      "Dot response belongs to another request, head, or workflow attempt",
    );
  }
  if (
    !Array.isArray(response.changedPaths) ||
    response.changedPaths.some((path) => typeof path !== "string") ||
    !/^[0-9a-f]{40}$/.test(response.resultHead) ||
    typeof response.stdout !== "string" ||
    !["completed", "blocked"].includes(response.status)
  )
    throw new Error("Invalid dot response result");
  if (response.status === "blocked")
    throw new Error(
      "Dot reported the handoff blocked; inspect the response record",
    );
  return response;
}

function localContext(
  context: AgentInvocation,
  signal: AbortSignal,
): AgentInvocation {
  if (!context.worktreeCwd || process.platform === "win32") {
    throw new Error(
      "Dot currently requires a POSIX host worktree (no-sandbox or bind-mounted sandbox)",
    );
  }
  return {
    ...context,
    signal,
    exec: (command, stdin) =>
      new Promise((resolveCommand, reject) => {
        signal.throwIfAborted();
        const child = spawn("sh", ["-c", command], {
          cwd: context.worktreeCwd,
          detached: true,
          stdio: ["pipe", "pipe", "pipe"],
        });
        let stdout = "";
        let stderr = "";
        const abort = () => {
          if (child.pid) {
            try {
              process.kill(-child.pid, "SIGKILL");
            } catch {}
          }
        };
        signal.addEventListener("abort", abort, { once: true });
        child.stdout.on("data", (chunk) => {
          stdout += chunk.toString();
        });
        child.stderr.on("data", (chunk) => {
          stderr += chunk.toString();
        });
        child.stdin.end(stdin);
        child.on("error", (error) => {
          signal.removeEventListener("abort", abort);
          reject(error);
        });
        child.on("close", (code) => {
          signal.removeEventListener("abort", abort);
          if (signal.aborted) reject(signal.reason);
          else resolveCommand({ stdout, stderr, exitCode: code ?? 1 });
        });
      }),
  };
}

async function withAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  signal.throwIfAborted();
  return new Promise<T>((resolvePromise, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    promise
      .then(resolvePromise, reject)
      .finally(() => signal.removeEventListener("abort", abort));
  });
}

async function waitForResponse(
  request: DotRequest,
  directory: string,
  ref: string,
  signal: AbortSignal,
): Promise<DotResponse> {
  const responsePath = join(directory, request.id, "response.json");
  const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
  const remote = process.env.GITHUB_ACTIONS === "true";
  while (true) {
    signal.throwIfAborted();
    if (remote) {
      const url = `https://api.github.com/repos/${request.repository}/contents/responses/${request.id}.json?ref=${encodeURIComponent(ref)}`;
      const response = await fetch(url, {
        headers: {
          Accept: "application/vnd.github+json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        signal,
      });
      if (response.ok) {
        const file = (await response.json()) as {
          content?: string;
          encoding?: string;
        };
        if (file.encoding !== "base64" || !file.content)
          throw new Error("Response is not an ordinary repository file");
        return JSON.parse(
          Buffer.from(file.content, "base64").toString("utf8"),
        ) as DotResponse;
      }
      if (response.status !== 404)
        throw new Error(`Dot response lookup failed (${response.status})`);
    } else {
      try {
        return JSON.parse(await readFile(responsePath, "utf8")) as DotResponse;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    await new Promise<void>((resolveWait, reject) => {
      const abort = () => {
        clearTimeout(timer);
        reject(signal.reason);
      };
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", abort);
        resolveWait();
      }, 5000);
      signal.addEventListener("abort", abort, { once: true });
    });
  }
}

/** A mailbox transport, not an API/model client. Existing Sandcastle stages remain in charge. */
export function dot(options: DotOptions = {}): AgentProvider {
  const directory = resolve(options.directory ?? ".sandcastle/dot");
  const replay: ReplayState | undefined = options.replay
    ? { entries: options.replay, cursor: 0 }
    : undefined;
  const journal: DotExchange[] = [];
  const timeoutSeconds = options.timeoutSeconds ?? 45 * 60;
  if (
    !Number.isFinite(timeoutSeconds) ||
    timeoutSeconds <= 0 ||
    timeoutSeconds > 45 * 60
  ) {
    throw new Error("Dot timeout must be between 0 and 2700 seconds");
  }
  const sessionPath = (id: string) => {
    if (!/^[a-zA-Z0-9-]+$/.test(id))
      throw new Error("Invalid dot session identifier");
    return join(directory, "sessions", `${id}.json`);
  };
  const exists = async (id: string) => {
    try {
      await readFile(sessionPath(id));
      return true;
    } catch {
      return false;
    }
  };
  return {
    name: "dot",
    env: {},
    captureSessions: false,
    sessionStorage: {
      captureToHost: async () => {},
      resumeIntoSandbox: async () => {},
      existsOnHost: async (_cwd, id) => exists(id),
      readHostSession: async (_cwd, id) => {
        try {
          return await readFile(sessionPath(id), "utf8");
        } catch {
          return undefined;
        }
      },
      hostSessionFilePath: (_cwd, id) => sessionPath(id),
      findByIdOnHost: async (id) => ({
        path: (await exists(id)) ? sessionPath(id) : undefined,
        searchedRoot: directory,
      }),
    },
    buildPrintCommand: () => {
      throw new Error("Dot requires Sandcastle's host-side handoff transport");
    },
    parseStreamLine: () => [],
    invoke: async (context: AgentInvocation) => {
      const deadline = AbortSignal.timeout(timeoutSeconds * 1000);
      const signal = context.signal
        ? AbortSignal.any([deadline, context.signal])
        : deadline;
      context = localContext(context, signal);
      let repository = options.repository ?? process.env.GITHUB_REPOSITORY;
      if (!options.exchange) {
        const remote = await context.exec("git remote get-url origin");
        const match = remote.stdout
          .trim()
          .match(
            /^(?:https:\/\/github\.com\/|git@github\.com:)([\w.-]+\/[\w.-]+?)(?:\.git)?$/,
          );
        if (
          remote.exitCode !== 0 ||
          !match ||
          (repository && repository !== match[1])
        ) {
          throw new Error(
            "Dot repository must match the worktree's GitHub origin",
          );
        }
        repository ??= match[1];
      }
      if (!repository || !/^[\w.-]+\/[\w.-]+$/.test(repository))
        throw new Error("Set the dot repository to owner/repo");
      const id = randomUUID();
      let sessionId =
        context.resumeSession && !context.forkSession
          ? context.resumeSession
          : randomUUID();
      let prompt = context.prompt;
      for (const local of [
        context.cwd,
        context.hostCwd,
        context.worktreeCwd!,
        homedir(),
      ].sort((a, b) => b.length - a.length)) {
        if (local.length > 1) prompt = prompt.replaceAll(local, "<workspace>");
      }
      const unsigned = {
        version: 1 as const,
        id,
        repository,
        runId: process.env.GITHUB_RUN_ID ?? "local",
        runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? "1",
        ...(process.env.GITHUB_SHA
          ? { controllerHead: process.env.GITHUB_SHA }
          : {}),
        prompt,
        resumeSession: context.resumeSession,
        forkSession: context.forkSession ?? false,
        sessionId,
        expiresAt: new Date(Date.now() + timeoutSeconds * 1000).toISOString(),
        ...(process.env.SANDCASTLE_DOT_STAGE
          ? { stage: JSON.parse(process.env.SANDCASTLE_DOT_STAGE) }
          : {}),
        snapshot: await withAbort(
          captureDotSnapshot({ ...context, signal }, options.refs),
          signal,
        ),
      };
      let request: DotRequest = {
        ...unsigned,
        hash: createHash("sha256")
          .update(JSON.stringify(unsigned))
          .digest("hex"),
      };
      const state =
        replay ??
        (process.env.SANDCASTLE_DOT_REPLAY_FILE
          ? await replayFile(process.env.SANDCASTLE_DOT_REPLAY_FILE)
          : undefined);
      const previous = state?.entries[state.cursor];
      let recovered: DotResponse | undefined;
      if (previous) {
        if (!replayMatches(previous.request, request)) {
          throw new Error(
            "Recovery boundary changed; reconcile the stage before replay",
          );
        }
        state!.cursor++;
        if (process.env.SANDCASTLE_DOT_REPLAY_FILE) {
          await writeFile(
            `${process.env.SANDCASTLE_DOT_REPLAY_FILE}.used`,
            String(state!.cursor),
          );
        }
        if (previous.response) {
          request = previous.request;
          sessionId = request.sessionId;
          recovered = validateDotResponse(request, previous.response);
        }
      }
      const requestDirectory = join(directory, request.id);
      await mkdir(requestDirectory, { recursive: true });
      const requestFile = join(requestDirectory, "request.json");
      await writeFile(requestFile, JSON.stringify(request, null, 2));
      journal.push({ request });
      const journalFile = join(directory, "journal.json");
      await writeFile(journalFile, JSON.stringify(journal, null, 2));
      if (
        !recovered &&
        process.env.GITHUB_ACTIONS === "true" &&
        !options.exchange
      ) {
        const { DefaultArtifactClient } = await import("@actions/artifact");
        const { id: artifactId } = await withAbort(
          new DefaultArtifactClient().uploadArtifact(
            `dot-request-${id}`,
            [requestFile],
            requestDirectory,
            { retentionDays: 7 },
          ),
          signal,
        );
        signal.throwIfAborted();
        console.log(
          `Awaiting dot: request ${id}, artifact ${artifactId}. The agent has not completed.`,
        );
      } else if (!recovered)
        console.log(
          `Awaiting dot: request ${id}. The agent has not completed.`,
        );
      try {
        const response = validateDotResponse(
          request,
          recovered ??
            (await withAbort(
              options.exchange
                ? options.exchange(request, signal)
                : waitForResponse(
                    request,
                    directory,
                    options.responseRef ??
                      process.env.SANDCASTLE_DOT_RESPONSE_REF ??
                      "sandcastle-dot-responses",
                    signal,
                  ),
              signal,
            )),
        );
        signal.throwIfAborted();
        await withAbort(
          applyDotCommit(
            { ...context, signal },
            request.snapshot,
            response.resultHead,
            response.changedPaths,
          ),
          signal,
        );
        signal.throwIfAborted();
        await writeFile(
          join(requestDirectory, "response.json"),
          JSON.stringify(response, null, 2),
        );
        journal[journal.length - 1]!.response = response;
        await writeFile(journalFile, JSON.stringify(journal, null, 2));
        await mkdir(join(directory, "sessions"), { recursive: true });
        await writeFile(
          sessionPath(sessionId),
          JSON.stringify({
            sessionId,
            parent: context.resumeSession,
            requestId: request.id,
            requestHash: request.hash,
          }),
        );
        return { result: response.stdout, sessionId };
      } catch (error) {
        await writeFile(
          join(requestDirectory, "status.json"),
          JSON.stringify({
            status: signal.aborted ? "expired_or_cancelled" : "failed",
            requestId: id,
          }),
        );
        throw error;
      }
    },
  };
}
