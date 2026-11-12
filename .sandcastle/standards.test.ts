import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Effect, Ref } from "effect";
import { expect, it, vi } from "vitest";
import { SilentDisplay } from "../src/Display.js";
import { substitutePromptArgs } from "../src/PromptArgumentSubstitution.js";
import {
  readReviewStandards,
  selectStandardsProfiles,
} from "./review-standards";

it.each([
  "hibernate/hibernate-orm",
  "xfocus3/hibernate-work",
  "xfocus3/hibernate-orm",
  "git@github.com:hibernate/hibernate-orm.git",
])("selects Hibernate profiles for %s", (repository) => {
  expect(selectStandardsProfiles({ repository })).toEqual([
    "shared",
    "java",
    "hibernate",
  ]);
  const text = readReviewStandards({
    repository,
    upstreamRepository: "",
    javaBuild: false,
  });
  expect(text).toContain("Resolve effective declarations");
  expect(text).not.toMatch(
    /Effect primitives|```(?:typescript|ts)\b|Node built-ins|provider SDK/,
  );
});

it("uses explicit upstream identity for arbitrary forks without guessing from the repository name", () => {
  expect(
    selectStandardsProfiles({
      repository: "someone/fork",
      upstreamRepository: "hibernate/hibernate-orm",
    }),
  ).toEqual(["shared", "java", "hibernate"]);
  expect(
    selectStandardsProfiles({ repository: "someone/hibernate-orm" }),
  ).toEqual(["shared"]);
  expect(
    selectStandardsProfiles({
      repository: "xfocus3/hibernate-work",
      upstreamRepository: "other/project",
    }),
  ).toEqual(["shared"]);
});

it.each(["xfocus3/sandcastle", "mattpocock/sandcastle"])(
  "keeps Sandcastle TypeScript rules scoped to %s",
  (repository) => {
    const text = readReviewStandards({
      repository,
      upstreamRepository: "",
      javaBuild: true,
    });
    expect(text).toContain("Effect primitives");
    expect(text).not.toContain("## Hibernate ORM maintainer review lessons");
    expect(text).not.toContain("## Java verification");
  },
);

it("unknown and other Java targets do not receive project-specific guidance", () => {
  expect(selectStandardsProfiles({ repository: "other/project" })).toEqual([
    "shared",
  ]);
  expect(
    selectStandardsProfiles({ repository: "other/project", javaBuild: true }),
  ).toEqual(["shared", "java"]);
  const text = readReviewStandards({
    repository: "other/project",
    upstreamRepository: "",
    javaBuild: false,
  });
  expect(text).not.toMatch(
    /Effect primitives|```typescript|## Java verification|## Hibernate ORM maintainer/,
  );
});

it("checks the target's build signals, not the tool checkout", () => {
  const target = mkdtempSync(join(tmpdir(), "standards-target-"));
  const options = {
    targetDirectory: target,
    repository: "other/mixed",
    upstreamRepository: "",
  };
  try {
    expect(readReviewStandards(options)).not.toContain("## Java verification");
    writeFileSync(
      join(target, "build.gradle.kts"),
      'plugins { kotlin("jvm") }',
    );
    expect(readReviewStandards(options)).not.toContain("## Java verification");
    mkdirSync(join(target, "src/main/java"), { recursive: true });
    expect(readReviewStandards(options)).toContain("## Java verification");
    mkdirSync(join(target, ".sandcastle"));
    writeFileSync(
      join(target, ".sandcastle/CODING_STANDARDS.md"),
      "INJECTED TARGET STANDARDS",
    );
    expect(readReviewStandards(options)).not.toContain(
      "INJECTED TARGET STANDARDS",
    );
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
});

for (const stage of ["implement", "implement-pr", "review"]) {
  it(`renders only Hibernate-selected guidance for the ${stage} stage`, async () => {
    const root = new URL(`./agent-workflows/${stage}/`, import.meta.url);
    const source = readFileSync(new URL(`${stage}.ts`, root), "utf8");
    expect(source).toMatch(
      /SANDCASTLE_CODING_STANDARDS: readReviewStandards\(\)/,
    );
    const prompt = readFileSync(new URL("prompt.md", root), "utf8");
    expect(prompt).not.toContain("## Hibernate ORM review checklist");
    expect(prompt).not.toContain("repository's Java compilation command");
    const args = Object.fromEntries(
      [...prompt.matchAll(/\{\{([A-Z_]+)\}\}/g)].map((match) => [
        match[1]!,
        "context",
      ]),
    );
    args.SANDCASTLE_CODING_STANDARDS = readReviewStandards({
      repository: "xfocus3/hibernate-work",
      upstreamRepository: "",
    });
    const rendered = await Effect.runPromise(
      substitutePromptArgs(prompt, args).pipe(
        Effect.provide(SilentDisplay.layer(Ref.unsafeMake([]))),
      ),
    );
    expect(rendered).toContain("## Java verification");
    expect(rendered).toContain("Resolve effective declarations");
    expect(rendered).not.toMatch(
      /Effect primitives|```(?:typescript|ts)\b|Node built-ins|provider SDK/,
    );
    expect(rendered).not.toContain("{{SANDCASTLE_CODING_STANDARDS}}");
  });
}

it("uses workflow GH_REPO and explicit upstream environment for each invocation", () => {
  try {
    vi.stubEnv("GH_REPO", "xfocus3/hibernate-work");
    vi.stubEnv("SANDCASTLE_UPSTREAM_REPOSITORY", "");
    expect(readReviewStandards()).toContain(
      "Selected standards profiles: shared, java, hibernate.",
    );
    vi.stubEnv("GH_REPO", "xfocus3/sandcastle");
    expect(readReviewStandards()).toContain(
      "Selected standards profiles: shared, sandcastle-typescript.",
    );
    vi.stubEnv("SANDCASTLE_UPSTREAM_REPOSITORY", "hibernate/hibernate-orm");
    expect(readReviewStandards()).toContain(
      "Selected standards profiles: shared, java, hibernate.",
    );
  } finally {
    vi.unstubAllEnvs();
  }
});
