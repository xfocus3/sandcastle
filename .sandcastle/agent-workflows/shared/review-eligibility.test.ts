import { describe, expect, it } from "vitest";
import { reviewableHead, verifiedHead } from "../../../scripts/dot/verification.mjs";
const head = "a".repeat(40);
const path = ".github/workflows/ci.yml";
const run = { id: 42, run_attempt: 1, head_sha: head, path, status: "completed", conclusion: "cancelled" };
const evidence = { head, reason: "Baseline timeouts investigated", evidence: ["https://github.com/example/project/actions/runs/42"], runs: [{ id: 42, attempt: 1, path, conclusion: "cancelled", classification: "timeout" }] };
describe("evidence-bound draft review", () => {
  it("allows reviewed terminal limitations without making the head verified", () => {
    expect(reviewableHead([run], head, [path], evidence)).toBe(true);
    expect(verifiedHead([run], head, [path])).toBe(false);
  });
  it("still allows normal successful verification", () => {
    expect(reviewableHead([{ ...run, conclusion: "success" }], head, [path], null)).toBe(true);
  });
  it.each(["queued", "in_progress", "waiting", "pending"])("never bypasses %s", status => {
    expect(reviewableHead([{ ...run, status }], head, [path], evidence)).toBe(false);
  });
  it.each(["action_required", "skipped", "neutral", null])("never accepts %s", conclusion => {
    expect(reviewableHead([{ ...run, conclusion }], head, [path], { ...evidence, runs: [{ ...evidence.runs[0], conclusion }] })).toBe(false);
  });
  it("rejects stale heads, attempts and replacement runs", () => {
    expect(reviewableHead([run], "b".repeat(40), [path], evidence)).toBe(false);
    expect(reviewableHead([{ ...run, run_attempt: 2 }], head, [path], evidence)).toBe(false);
    expect(reviewableHead([run, { ...run, id: 43 }], head, [path], evidence)).toBe(false);
  });
  it("requires evidence, explanation, recognized classification and all checks", () => {
    for (const invalid of [null, {}, { ...evidence, reason: "" }, { ...evidence, evidence: [] }, { ...evidence, runs: [{ ...evidence.runs[0], classification: "unknown" }] }]) {
      expect(reviewableHead([run], head, [path], invalid)).toBe(false);
    }
    expect(reviewableHead([run], head, [path, ".github/workflows/lint.yml"], evidence)).toBe(false);
    expect(reviewableHead([run], head, [], evidence)).toBe(false);
  });
});
