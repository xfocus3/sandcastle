import { beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { fetchVerification, verifiedHead } from "../../../scripts/dot/verification.mjs";

const head = "a".repeat(40);
const path = ".github/workflows/ci.yml";
const success = { id: 1, head_sha: head, path, status: "completed", conclusion: "success" };

describe("review verification gate", () => {
  it("accepts successful configured workflows at the exact head", () => {
    expect(verifiedHead([success], head, [path])).toBe(true);
  });
  it("rejects absent configuration and missing runs", () => {
    expect(verifiedHead([success], head, [])).toBe(false);
    expect(verifiedHead([], head, [path])).toBe(false);
  });
  it.each(["failure", "cancelled", "timed_out", "action_required", "skipped", null])("rejects %s", conclusion => {
    expect(verifiedHead([{ ...success, conclusion }], head, [path])).toBe(false);
  });
  it("rejects an unfinished rerun even after an older success", () => {
    expect(verifiedHead([success, { ...success, id: 2, status: "in_progress", conclusion: null }], head, [path])).toBe(false);
  });
  it("rejects success on a different head or workflow", () => {
    expect(verifiedHead([success], "b".repeat(40), [path])).toBe(false);
    expect(verifiedHead([success], head, [".github/workflows/other.yml"])).toBe(false);
  });
  it("requires every configured workflow", () => {
    const other = ".github/workflows/lint.yml";
    expect(verifiedHead([success], head, [path, other])).toBe(false);
    expect(verifiedHead([success, { ...success, id: 2, path: other }], head, [path, other])).toBe(true);
  });
});

vi.mock("node:child_process", () => ({ execFileSync: vi.fn() }));

describe("verification history transport", () => {
  beforeEach(() => vi.clearAllMocks());

  it("projects only verification fields before collecting command output", () => {
    vi.mocked(execFileSync).mockReturnValue(JSON.stringify({ workflow_runs: [success] }));
    expect(fetchVerification(head, [path])).toBe(true);
    const args = vi.mocked(execFileSync).mock.calls[0][1] as string[];
    expect(args).toContain("--jq");
    expect(args.join(" ")).toContain("display_title");
    expect(args.join(" ")).toContain("page=1");
    expect(args).not.toContain("--slurp");
    expect(vi.mocked(execFileSync).mock.calls[0][2]).toMatchObject({ maxBuffer: 8 * 1024 * 1024 });
  });

  it("continues through full pages and rejects a later unfinished run", () => {
    vi.mocked(execFileSync)
      .mockReturnValueOnce(JSON.stringify({ workflow_runs: Array.from({ length: 100 }, (_, i) => ({ ...success, id: i + 1 })) }))
      .mockReturnValueOnce(JSON.stringify({ workflow_runs: [{ ...success, id: 101, status: "in_progress", conclusion: null }] }));
    expect(fetchVerification(head, [path])).toBe(false);
    expect(execFileSync).toHaveBeenCalledTimes(2);
    expect((vi.mocked(execFileSync).mock.calls[1][1] as string[]).join(" ")).toContain("page=2");
  });

  it("fails closed on command failures", () => {
    vi.mocked(execFileSync).mockImplementation(() => { throw new Error("history unavailable"); });
    expect(() => fetchVerification(head, [path])).toThrow("history unavailable");
  });
});
