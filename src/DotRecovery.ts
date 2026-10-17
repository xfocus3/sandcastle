import { createHash } from "node:crypto";
import type { DotSnapshot } from "./DotSnapshot.js";
import type { DotExchange } from "./DotHandoff.js";

export const dotStageScripts = new Set(
  ["explore", "implement", "review", "implement-pr", "update-branch"].map(
    (stage) => `.sandcastle/agent-workflows/${stage}/${stage}.ts`,
  ),
);
export interface DotStageInput {
  version: 1;
  id: string;
  script: string;
  repository: string;
  workflowHead: string;
  controllerHash: string;
  runId: string;
  runAttempt: string;
  env: Record<string, string>;
  batch?: string;
  snapshot: DotSnapshot;
  hash: string;
}
export interface DotRecoveryRecord {
  stage: DotStageInput;
  exchanges: DotExchange[];
  lease: { ref: string; head: string | null };
}

/** Check before any restoration or stage execution. This grants no publication authority. */
export function validateDotRecovery(
  record: DotRecoveryRecord,
  repository: string,
): void {
  const stage = record.stage;
  const { hash, ...unsigned } = stage;
  if (
    stage.version !== 1 ||
    createHash("sha256").update(JSON.stringify(unsigned)).digest("hex") !==
      hash ||
    stage.repository !== repository
  ) {
    throw new Error("Recovery stage identity mismatch");
  }
  if (!dotStageScripts.has(stage.script))
    throw new Error("Unsupported recovery stage");
  if (
    !/^\d+$/.test(stage.runId) ||
    !/^\d+$/.test(stage.runAttempt) ||
    !/^[0-9a-f]{40}$/.test(stage.workflowHead) ||
    !/^[0-9a-f]{64}$/.test(stage.controllerHash)
  )
    throw new Error("Invalid original run identity");
  if (
    !Array.isArray(record.exchanges) ||
    record.exchanges.some(
      (entry, index) =>
        !entry?.request ||
        (!entry.response && index !== record.exchanges.length - 1),
    )
  )
    throw new Error("Invalid exchange journal");
  for (const exchange of record.exchanges) {
    if (
      exchange.request.stage?.inputHash !== stage.hash ||
      exchange.request.stage?.id !== stage.id ||
      exchange.request.stage?.script !== stage.script
    )
      throw new Error("Exchange belongs to another stage boundary");
  }
  for (const key of ["ISSUE_NUMBER", "PR_NUMBER"]) {
    if (stage.env[key] !== undefined && !/^\d+$/.test(stage.env[key]!))
      throw new Error("Invalid stage issue/PR input");
  }
  for (const key of ["BRANCH", "BASE_REF", "SANDCASTLE_DOT_RESPONSE_REF"]) {
    if (stage.env[key] !== undefined && !/^[\w./-]+$/.test(stage.env[key]!))
      throw new Error("Invalid stage ref input");
  }
  if (stage.env.GH_REPO && stage.env.GH_REPO !== repository)
    throw new Error("Stage GitHub context belongs to another repository");
  if (
    !/^refs\/heads\/[\w./-]+$/.test(record.lease?.ref) ||
    (record.lease?.head !== null && !/^[0-9a-f]{40}$/.test(record.lease?.head))
  )
    throw new Error("Missing recovery branch lease");
  if (
    record.lease.ref !==
    `refs/heads/${stage.env.BRANCH ?? stage.snapshot.branch}`
  )
    throw new Error("Recovery lease belongs to another branch");
}

export function reconcileDotRecovery(
  record: DotRecoveryRecord,
  run: { status: string; run_attempt: number; head_sha: string },
  remoteHead: string | null,
  controllerHash: string,
): void {
  if (
    run.status !== "completed" ||
    String(run.run_attempt) !== record.stage.runAttempt ||
    run.head_sha !== record.stage.workflowHead
  )
    throw new Error(
      "Original runner still active or identity changed; reconnect instead of replaying",
    );
  if (controllerHash !== record.stage.controllerHash)
    throw new Error(
      "Recovery controller differs from the original runtime; use the exact controller sources and lockfile",
    );
  if (remoteHead !== record.lease.head)
    throw new Error("Recovery branch advanced; reconcile before restoring");
}
