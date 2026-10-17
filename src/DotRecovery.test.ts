import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  validateDotRecovery,
  reconcileDotRecovery,
  type DotRecoveryRecord,
} from "./DotRecovery.js";

function fixture(): DotRecoveryRecord {
  const head = "a".repeat(40);
  const unsigned = {
    version: 1 as const,
    id: "stage",
    script: ".sandcastle/agent-workflows/implement/implement.ts",
    repository: "fixture/repo",
    workflowHead: head,
    controllerHash: "c".repeat(64),
    runId: "123",
    runAttempt: "1",
    env: { BRANCH: "task", ISSUE_NUMBER: "1", GH_REPO: "fixture/repo" },
    snapshot: {
      head,
      branch: "task",
      refs: "",
      taskRefs: [],
      index: "",
      indexObjects: "",
      merge: {},
      files: [],
    },
  };
  return {
    stage: {
      ...unsigned,
      hash: createHash("sha256").update(JSON.stringify(unsigned)).digest("hex"),
    },
    exchanges: [],
    lease: { ref: "refs/heads/task", head },
  };
}

describe("dot recovery reconciliation", () => {
  it("permits a terminal original run at the exact branch lease", () => {
    const record = fixture();
    expect(() => validateDotRecovery(record, "fixture/repo")).not.toThrow();
    expect(() =>
      reconcileDotRecovery(
        record,
        {
          status: "completed",
          run_attempt: 1,
          head_sha: record.stage.workflowHead,
        },
        record.lease.head,
        record.stage.controllerHash,
      ),
    ).not.toThrow();
  });
  it("blocks active, rerun or different-controller jobs and stale branches", () => {
    const record = fixture();
    for (const run of [
      {
        status: "in_progress",
        run_attempt: 1,
        head_sha: record.stage.workflowHead,
      },
      {
        status: "completed",
        run_attempt: 2,
        head_sha: record.stage.workflowHead,
      },
      { status: "completed", run_attempt: 1, head_sha: "b".repeat(40) },
    ]) {
      expect(() =>
        reconcileDotRecovery(
          record,
          run,
          record.lease.head,
          record.stage.controllerHash,
        ),
      ).toThrow();
    }
    expect(() =>
      reconcileDotRecovery(
        record,
        {
          status: "completed",
          run_attempt: 1,
          head_sha: record.stage.workflowHead,
        },
        "b".repeat(40),
        record.stage.controllerHash,
      ),
    ).toThrow("advanced");
  });
  it("supports an explicitly absent unpushed branch and blocks incompatible controllers", () => {
    const record = fixture();
    record.lease.head = null;
    const run = {
      status: "completed",
      run_attempt: 1,
      head_sha: record.stage.workflowHead,
    };
    expect(() => validateDotRecovery(record, "fixture/repo")).not.toThrow();
    expect(() =>
      reconcileDotRecovery(record, run, null, record.stage.controllerHash),
    ).not.toThrow();
    expect(() =>
      reconcileDotRecovery(
        record,
        run,
        "a".repeat(40),
        record.stage.controllerHash,
      ),
    ).toThrow("advanced");
    expect(() =>
      reconcileDotRecovery(record, run, null, "d".repeat(64)),
    ).toThrow("controller differs");
  });
  it("blocks corrupt inputs, another repository and another task lease", () => {
    const record = fixture();
    expect(() => validateDotRecovery(record, "other/repo")).toThrow();
    expect(() =>
      validateDotRecovery(
        { ...record, lease: { ...record.lease, ref: "refs/heads/other" } },
        "fixture/repo",
      ),
    ).toThrow("another branch");
    record.stage.env.ISSUE_NUMBER = "1; unsafe";
    expect(() => validateDotRecovery(record, "fixture/repo")).toThrow(
      "identity",
    );
  });
});
