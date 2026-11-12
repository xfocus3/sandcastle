import {
  readFileSync,
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Ref } from "effect";
import { afterEach, expect, it, vi } from "vitest";
import { SilentDisplay } from "../../../src/Display.js";
import { substitutePromptArgs } from "../../../src/PromptArgumentSubstitution.js";
import { readReviewStandards } from "../../review-standards";
import { runWithExtraction } from "../shared/run-with-extraction";

vi.mock("../shared/run-with-extraction", () => ({
  runWithExtraction: vi.fn(async () => ({
    commits: [],
    output: { summary: "Reviewed", inlineComments: [], replies: [] },
  })),
}));
vi.mock("../shared/common", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../shared/common")>()),
  required: (name: string) => name,
  dotAgent: vi.fn(),
  sh: () => "head",
  writeJson: vi.fn(),
  writeText: vi.fn(),
  fail: (message: string) => {
    throw new Error(message);
  },
}));
vi.mock("../shared/review-context", () => ({
  fetchPullRequestContext: () => ({
    prTitle: "Fix",
    issueNumber: "1",
    issueTitle: "Issue",
    linkedIssue: "Details",
    diff: "",
    prCommentsJson: "[]",
    diffLines: new Map(),
    validReplyIds: new Set(),
  }),
}));

const originalCwd = process.cwd();
let target: string;
afterEach(() => {
  process.chdir(originalCwd);
  vi.unstubAllEnvs();
  if (target) rmSync(target, { recursive: true, force: true });
});

it("delivers current tool standards in the actual review stage from an external target", async () => {
  target = mkdtempSync(join(tmpdir(), "review-target-"));
  process.chdir(target);
  vi.stubEnv("GH_REPO", "xfocus3/hibernate-work");
  // The target has no Sandcastle files. Neither the loader nor stage may depend on them.
  await import("./review");
  const options = vi.mocked(runWithExtraction).mock.calls[0]![0];
  const expected = readReviewStandards();
  expect(options.promptArgs?.SANDCASTLE_CODING_STANDARDS).toBe(expected);
  const rendered = await Effect.runPromise(
    substitutePromptArgs(
      readFileSync(options.promptFile!, "utf8"),
      options.promptArgs!,
    ).pipe(Effect.provide(SilentDisplay.layer(Ref.unsafeMake([])))),
  );
  expect(rendered).toContain(expected);
  expect(rendered).toContain("General lessons from our Hibernate PR reviews");
  expect(rendered).toContain("Keep diagnostics useful and bounded");
  expect(rendered).toContain(
    "Resolve effective declarations, not annotation presence",
  );
  expect(rendered).toContain("Use the mapped dirty-check contract");
  expect(rendered).toContain("both optimistic and pessimistic callers");
  expect(rendered).toContain("Divergent histories require a separate");
  expect(rendered).toContain("Respect target-branch formatting rules");
  expect(rendered).toContain("Prove publication matches verification");
  expect(rendered).not.toContain("{{SANDCASTLE_CODING_STANDARDS}}");
  expect(rendered).not.toContain(target);
  expect(rendered).not.toContain("Effect primitives");
  expect(rendered).not.toContain("```typescript");
  expect(rendered).toContain(
    "Selected standards profiles: shared, java, hibernate",
  );

  // A stale target copy must not replace the trusted pinned tool's standards.
  mkdirSync(join(target, ".sandcastle"));
  writeFileSync(
    join(target, ".sandcastle/CODING_STANDARDS.md"),
    "stale target standards",
  );
  expect(readReviewStandards()).toBe(expected);
});

it("wires both legacy reviewer callers and fingerprints the standards for recovery", () => {
  const root = new URL("../../../", import.meta.url);
  for (const name of [".sandcastle/run.ts", ".factory/implement-task.ts"]) {
    const source = readFileSync(new URL(name, root), "utf8");
    expect(source).toMatch(
      /review-prompt\.md[\s\S]*SANDCASTLE_CODING_STANDARDS: readReviewStandards\(/,
    );
  }
  expect(
    readFileSync(new URL(".sandcastle/review-prompt.md", root), "utf8"),
  ).toContain("{{SANDCASTLE_CODING_STANDARDS}}");
  const stage = readFileSync(new URL("scripts/dot/stage.ts", root), "utf8");
  expect(stage).toContain('".sandcastle/CODING_STANDARDS.md"');
  expect(stage).toContain('".sandcastle/review-standards.ts"');
  expect(stage).toContain('".sandcastle/standards"');
});
