import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";

const fixtures: string[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0))
    rmSync(fixture, { recursive: true, force: true });
});

const fixture = () => {
  const directory = mkdtempSync(join(tmpdir(), "standards-provenance-"));
  fixtures.push(directory);
  const tool = join(directory, "tool");
  const target = join(directory, "target");
  mkdirSync(join(tool, ".sandcastle/standards"), { recursive: true });
  mkdirSync(join(target, ".sandcastle/standards"), { recursive: true });
  for (const name of ["shared", "java", "hibernate", "sandcastle-typescript"]) {
    copyFileSync(
      new URL(`./standards/${name}.md`, import.meta.url),
      join(tool, `.sandcastle/standards/${name}.md`),
    );
    writeFileSync(
      join(target, `.sandcastle/standards/${name}.md`),
      "UNTRUSTED TARGET COPY",
    );
  }
  mkdirSync(join(tool, "scripts"));
  copyFileSync(
    new URL("../scripts/prepare-official-pr.ts", import.meta.url),
    join(tool, "scripts/prepare-official-pr.ts"),
  );
  copyFileSync(
    new URL("./review-standards.ts", import.meta.url),
    join(tool, ".sandcastle/review-standards.ts"),
  );
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", tool, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  git("init", "--quiet");
  git("add", ".");
  git(
    "-c",
    "user.name=Standards Test",
    "-c",
    "user.email=standards@example.invalid",
    "-c",
    "core.hooksPath=/dev/null",
    "commit",
    "--quiet",
    "-m",
    "Fixture",
  );
  const revision = git("rev-parse", "HEAD");
  const run = (expected = revision) =>
    execFileSync(
      process.execPath,
      [
        fileURLToPath(
          new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url),
        ),
        "--eval",
        `import { readReviewStandards } from ${JSON.stringify(join(tool, ".sandcastle/review-standards.ts"))}; process.stdout.write(JSON.stringify(readReviewStandards()));`,
      ],
      {
        cwd: target,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          GH_REPO: "xfocus3/hibernate-work",
          SANDCASTLE_UPSTREAM_REPOSITORY: "",
          SANDCASTLE_EXPECTED_TOOL_REF: expected,
        },
      },
    );
  return { tool, revision, run };
};

it("verifies an immutable tool checkout and reports the exact selected text from an external target", () => {
  const { tool, revision, run } = fixture();
  const output = run();
  const selected = ["shared", "java", "hibernate"].map((profile) => ({
    profile,
    text: readFileSync(
      join(tool, `.sandcastle/standards/${profile}.md`),
      "utf8",
    ),
  }));
  const digest = createHash("sha256")
    .update(JSON.stringify(selected))
    .digest("hex");
  expect(output).toContain(
    `[standards] revision=${revision} profiles=shared,java,hibernate sha256=${digest}`,
  );
  const text: string = JSON.parse(output.split("\n").at(-1)!);
  expect(text).toContain(`Standards tool revision: ${revision}.`);
  expect(text).toContain(`Selected standards SHA-256: ${digest}.`);
  expect(text).toContain("Operation context across loader boundaries");
  expect(text).not.toContain("UNTRUSTED TARGET COPY");
  expect(text).not.toContain(tool);
  expect(text).not.toContain("Effect primitives");
});

it("rejects a wrong checkout before delivering standards", () => {
  const { run, revision } = fixture();
  const wrong = (revision[0] === "0" ? "1" : "0") + revision.slice(1);
  expect(() => run(wrong)).toThrow(/Standards tool revision mismatch/);
});

it("rejects a moving revision instead of silently selecting mutable standards", () => {
  expect(() => fixture().run("main")).toThrow(
    /immutable 40-character tool revision/,
  );
});

it("rejects modified tracked profile text even when the checkout revision matches", () => {
  const { tool, run } = fixture();
  writeFileSync(
    join(tool, ".sandcastle/standards/hibernate.md"),
    "MODIFIED TRUSTED PROFILE",
  );
  expect(() => run()).toThrow(/modified tracked standards or stage files/);
});

it("rejects a modified tracked official-publication entry point", () => {
  const { tool, run } = fixture();
  writeFileSync(
    join(tool, "scripts/prepare-official-pr.ts"),
    "modified publication preparation",
  );
  expect(() => run()).toThrow(/modified tracked standards or stage files/);
});
