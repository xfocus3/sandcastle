import { execFileSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { afterEach, expect, it, vi } from "vitest";
import { readReviewStandards } from "./review-standards";
import { runWithExtraction } from "./agent-workflows/shared/run-with-extraction";

vi.mock("./agent-workflows/shared/run-with-extraction", () => ({
  runWithExtraction: vi.fn(async () => ({ output: { issues: [] } })),
}));
vi.mock("./agent-workflows/shared/common", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./agent-workflows/shared/common")>()),
  dotAgent: vi.fn(),
  writeJson: vi.fn(),
  fail: (message: string) => {
    throw new Error(message);
  },
}));

type Values = Record<string, string>;
interface Step {
  name?: string;
  env?: Values;
  uses?: string;
  with?: Values;
}
interface Job extends Step {
  steps: Step[];
}
interface Workflow {
  env?: Values;
  on: { workflow_call?: { inputs: Record<string, { default?: string }> } };
  jobs: Record<string, Job>;
}
const workflow = (name: string): Workflow =>
  parse(
    readFileSync(
      new URL(`../.github/workflows/${name}.yml`, import.meta.url),
      "utf8",
    ),
  );
const revision = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
const originalCwd = process.cwd();
let target: string | undefined;
afterEach(() => {
  process.chdir(originalCwd);
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  if (target) rmSync(target, { recursive: true, force: true });
  target = undefined;
});

// Resolve only the simple environment/input expressions these wrappers use.
// Unsupported syntax fails instead of silently emulating more of Actions.
const resolve = (value: string, context: Values): string =>
  value.replace(/\$\{\{\s*(.*?)\s*\}\}/g, (_, expression: string) => {
    for (const key of expression.split(/\s*\|\|\s*/)) {
      if (!(key in context))
        throw new Error(`Unsupported workflow expression: ${key}`);
      if (context[key]) return context[key];
    }
    return "";
  });

// Execute the real github-script body with a recording child process. Never
// run the stage wrapper here: that would publish a live handoff checkpoint.
const agentEnvironment = async (
  definition: Workflow,
  stage: string,
  repository: string,
  upstream = "",
) => {
  const job = definition.jobs[stage]!;
  const step = job.steps.find((candidate) =>
    candidate.with?.script?.includes("scripts/dot/stage.ts"),
  )!;
  expect(step.uses).toBe("actions/github-script@v7");
  const context: Values = {
    "github.repository": repository,
    "inputs.tool_ref": revision,
    "inputs.upstream_repository": upstream,
    "inputs.issue_number": "1",
    "inputs.issue_title": "Fixture",
    "inputs.pr_number": "1",
    "inputs.branch": "fixture",
    "inputs.head_sha": "a".repeat(40),
    "inputs.base_ref": "main",
    "inputs.verification_workflows": "[]",
    "inputs.review_exception": "null",
    "github.event.issue.number": "1",
    "github.event.issue.title": "Fixture",
    "github.event.pull_request.number": "1",
    "github.event.pull_request.head.ref": "fixture",
    "github.event.pull_request.head.sha": "a".repeat(40),
    "steps.branch.outputs.name": "fixture",
    "runner.temp": tmpdir(),
    "github.token": "fixture",
    "secrets.GITHUB_TOKEN": "fixture",
  };
  const env = Object.fromEntries(
    Object.entries({
      ...definition.env,
      ...job.env,
      ...step.env,
    }).map(([key, value]) => [key, resolve(value, context)]),
  );
  const spawn = vi.fn(() => {
    const child = new EventEmitter();
    queueMicrotask(() => child.emit("close", 0));
    return child;
  });
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  await new AsyncFunction("require", "process", step.with!.script)(
    (name: string) => {
      if (name !== "node:child_process")
        throw new Error(`Unexpected require: ${name}`);
      return { spawn };
    },
    {
      execPath: process.execPath,
      env: { ...env, GITHUB_WORKSPACE: "/fixture" },
    },
  );
  const [command, args, options] = spawn.mock.calls[0] as unknown as [
    string,
    string[],
    { env: Values; cwd?: string },
  ];
  expect(args.at(-1)).toBe(`.sandcastle/agent-workflows/${stage}/${stage}.ts`);
  expect(command).toBe(
    job.env?.SANDCASTLE_EXPECTED_TOOL_REF ? process.execPath : "npx",
  );
  if (job.env?.SANDCASTLE_EXPECTED_TOOL_REF) {
    const checkout = job.steps.find(
      (candidate) => candidate.name === "Checkout Sandcastle",
    )!;
    expect(env.SANDCASTLE_EXPECTED_TOOL_REF).toBe(
      resolve(checkout.with!.ref!, context),
    );
    expect(options.cwd).toBe("/fixture/target");
  }
  return options.env;
};

const standards = (env: Values, java = false) => {
  target = mkdtempSync(join(tmpdir(), "workflow-standards-"));
  if (java) writeFileSync(join(target, "pom.xml"), "<project/>");
  process.chdir(target);
  // No ambient runner identity may fill a missing workflow variable.
  for (const key of [
    "GH_REPO",
    "SANDCASTLE_UPSTREAM_REPOSITORY",
    "SANDCASTLE_EXPECTED_TOOL_REF",
  ])
    vi.stubEnv(key, env[key] ?? "");
  if (!env.SANDCASTLE_EXPECTED_TOOL_REF)
    delete process.env.SANDCASTLE_EXPECTED_TOOL_REF;
  return readReviewStandards();
};

const cases = [
  {
    repository: "xfocus3/hibernate-work",
    upstream: "",
    profiles: "shared, java, hibernate",
  },
  {
    repository: "hibernate/hibernate-orm",
    upstream: "",
    profiles: "shared, java, hibernate",
  },
  {
    repository: "someone/fork",
    upstream: "hibernate/hibernate-orm",
    profiles: "shared, java, hibernate",
  },
  {
    repository: "xfocus3/sandcastle",
    upstream: "",
    profiles: "shared, sandcastle-typescript",
  },
  { repository: "other/project", upstream: "", profiles: "shared" },
  {
    repository: "other/java",
    upstream: "",
    java: true,
    profiles: "shared, java",
  },
  {
    repository: "xfocus3/hibernate-work",
    upstream: "other/project",
    profiles: "shared",
  },
];
for (const stage of ["explore", "implement", "implement-pr", "review"]) {
  it.each(cases)(
    `routes ${stage} target workflow identity for $repository / $upstream`,
    async ({ repository, upstream, java, profiles }) => {
      const definition = workflow(`agent-${stage}-target`);
      expect(
        definition.on.workflow_call!.inputs.upstream_repository!.default,
      ).toBe("");
      const env = await agentEnvironment(
        definition,
        stage,
        repository,
        upstream,
      );
      expect(env.GH_REPO).toBe(repository);
      expect(env.SANDCASTLE_UPSTREAM_REPOSITORY).toBe(upstream || repository);
      const text = standards(env, java);
      expect(text).toContain(`Selected standards profiles: ${profiles}.`);
      expect(text.includes("Effect primitives")).toBe(
        profiles.includes("sandcastle-typescript"),
      );
      expect(text.includes("## Hibernate ORM maintainer")).toBe(
        profiles.includes("hibernate"),
      );
    },
  );

  it.each(cases.filter(({ upstream }) => !upstream))(
    `routes native ${stage} workflow identity for $repository`,
    async ({ repository, java, profiles }) => {
      const env = await agentEnvironment(
        workflow(`agent-${stage}`),
        stage,
        repository,
      );
      expect(env.GH_REPO).toBe(repository);
      expect(standards(env, java)).toContain(
        `Selected standards profiles: ${profiles}.`,
      );
    },
  );
}

it.each([
  ["agent-implement-queue", "implement"],
  ["agent-pr-queue", "implement-pr"],
  ["agent-pr-queue", "review"],
])("carries upstream identity through %s to %s", async (queue, stage) => {
  const definition = workflow(queue!);
  expect(definition.on.workflow_call!.inputs.upstream_repository).toBeDefined();
  const job = definition.jobs[stage!]!;
  expect(job.uses).toMatch(
    new RegExp(`/agent-${stage}-target\\.yml@[0-9a-f]{40}$`),
  );
  expect(job.with!.tool_ref).toBe(job.uses!.split("@").at(-1));
  const upstream = resolve(job.with!.upstream_repository!, {
    "inputs.upstream_repository": "hibernate/hibernate-orm",
  });
  const env = await agentEnvironment(
    workflow(`agent-${stage}-target`),
    stage!,
    "someone/fork",
    upstream,
  );
  expect(standards(env)).toContain(
    "Selected standards profiles: shared, java, hibernate.",
  );
});

it("delivers workflow-selected Hibernate standards to the actual Explore prompt", async () => {
  const env = await agentEnvironment(
    workflow("agent-explore-target"),
    "explore",
    "xfocus3/hibernate-work",
  );
  const expected = standards(env);
  const issues = join(target!, "issues.json");
  writeFileSync(
    issues,
    JSON.stringify([
      {
        number: 1,
        title: "Fixture",
        body: "Details",
        author: { login: "fixture" },
        createdAt: "2026-01-01T00:00:00Z",
        url: "https://github.com/fixture/repo/issues/1",
        comments: [],
      },
    ]),
  );
  vi.stubEnv("ISSUES_FILE", issues);
  await import("./agent-workflows/explore/explore");
  const options = vi.mocked(runWithExtraction).mock.calls[0]![0];
  expect(options.promptArgs!.SANDCASTLE_CODING_STANDARDS).toBe(expected);
  expect(expected).toContain("## Java verification");
  expect(expected).toContain("Resolve effective declarations");
  expect(expected).not.toContain("Effect primitives");
});
