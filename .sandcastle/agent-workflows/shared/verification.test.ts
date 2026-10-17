import { describe, expect, it } from "vitest";
import { verifiedHead } from "../../../scripts/dot/verification.mjs";

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
