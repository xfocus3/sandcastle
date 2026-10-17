import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { homedir } from "node:os";
import type { AgentInvocation, AgentProvider } from "./AgentProvider.js";
import {
  applyDotCommit,
  captureDotSnapshot,
  type DotSnapshot,
} from "./DotSnapshot.js";

export interface DotRequest {
  version: 1;
  id: string;
  repository: string;
  runId: string;
  runAttempt: string;
  prompt: string;
  resumeSession?: string;
  forkSession: boolean;
  sessionId: string;
  expiresAt: string;
  snapshot: DotSnapshot;
  hash: string;
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

export interface DotOptions {
  /** Same GitHub repository as the worktree. Defaults to GITHUB_REPOSITORY. */
  repository?: string;
  /** Coordinator-owned response branch; response files never select a remote. */
  responseRef?: string;
  /** Local mailbox and sanitized session records. */
  directory?: string;
  /** Additional branches explicitly needed by this stage (for example merger inputs). */
  refs?: readonly string[];
  /** Hard wait bound, at most 45 minutes; expiry is an error, never completion. */
  timeoutSeconds?: number;
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
      const repository = options.repository ?? process.env.GITHUB_REPOSITORY;
      if (!repository || !/^[\w.-]+\/[\w.-]+$/.test(repository))
        throw new Error("Set the dot repository to owner/repo");
      if (!options.exchange) {
        const remote = await context.exec("git remote get-url origin");
        const name = remote.stdout
          .trim()
          .replace(/^git@github\.com:/, "https://github.com/")
          .replace(/\.git$/, "");
        if (
          remote.exitCode !== 0 ||
          name !== `https://github.com/${repository}`
        ) {
          throw new Error(
            "Dot repository must match the worktree's GitHub origin",
          );
        }
      }
      const id = randomUUID();
      const sessionId =
        context.resumeSession && !context.forkSession
          ? context.resumeSession
          : randomUUID();
      const deadline = AbortSignal.timeout(timeoutSeconds * 1000);
      const signal = context.signal
        ? AbortSignal.any([deadline, context.signal])
        : deadline;
      let prompt = context.prompt;
      for (const local of [context.cwd, context.hostCwd, homedir()].sort(
        (a, b) => b.length - a.length,
      )) {
        if (local.length > 1) prompt = prompt.replaceAll(local, "<workspace>");
      }
      const unsigned = {
        version: 1 as const,
        id,
        repository,
        runId: process.env.GITHUB_RUN_ID ?? "local",
        runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? "1",
        prompt,
        resumeSession: context.resumeSession,
        forkSession: context.forkSession ?? false,
        sessionId,
        expiresAt: new Date(Date.now() + timeoutSeconds * 1000).toISOString(),
        snapshot: await withAbort(
          captureDotSnapshot({ ...context, signal }, options.refs),
          signal,
        ),
      };
      const request: DotRequest = {
        ...unsigned,
        hash: createHash("sha256")
          .update(JSON.stringify(unsigned))
          .digest("hex"),
      };
      const requestDirectory = join(directory, id);
      await mkdir(requestDirectory, { recursive: true });
      const requestFile = join(requestDirectory, "request.json");
      await writeFile(requestFile, JSON.stringify(request, null, 2));
      if (process.env.GITHUB_ACTIONS === "true" && !options.exchange) {
        const { DefaultArtifactClient } = await import("@actions/artifact");
        const { id: artifactId } =
          await new DefaultArtifactClient().uploadArtifact(
            `dot-request-${id}`,
            [requestFile],
            requestDirectory,
            { retentionDays: 7 },
          );
        console.log(
          `Awaiting dot: request ${id}, artifact ${artifactId}. The agent has not completed.`,
        );
      } else
        console.log(
          `Awaiting dot: request ${id}. The agent has not completed.`,
        );
      try {
        const response = validateDotResponse(
          request,
          await withAbort(
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
          ),
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
        await mkdir(join(directory, "sessions"), { recursive: true });
        await writeFile(
          sessionPath(sessionId),
          JSON.stringify({
            sessionId,
            parent: context.resumeSession,
            requestId: id,
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
