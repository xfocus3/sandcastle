import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fail, outputDir, required, writeText } from "../shared/common";

const BRANCH = required("BRANCH");
const BASE_REF = required("BASE_REF");
const git = (...args: string[]) =>
  execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

// A failed or repeated invocation must never reuse an earlier publication signal.
writeText("should_push.txt", "false");
rmSync(join(outputDir(), "comment.md"), { force: true });
rmSync(join(outputDir(), "failure_reason.txt"), { force: true });

try {
  git("check-ref-format", `refs/heads/${BASE_REF}`);
  if (git("symbolic-ref", "--short", "HEAD") !== BRANCH) {
    fail("The checked-out branch changed. Reconcile it before retrying.");
  }
  for (const state of [
    "MERGE_HEAD",
    "rebase-merge",
    "rebase-apply",
    "sequencer",
  ]) {
    if (existsSync(git("rev-parse", "--git-path", state))) {
      fail(
        "A Git operation is already in progress. Reconcile it before retrying.",
      );
    }
  }

  git(
    "fetch",
    "origin",
    `refs/heads/${BASE_REF}:refs/remotes/origin/${BASE_REF}`,
  );
  const head = git("rev-parse", "HEAD");
  const base = git("rev-parse", `refs/remotes/origin/${BASE_REF}`);
  const mergeBase = git("merge-base", head, base);

  if (mergeBase === base) {
    writeText(
      "comment.md",
      `\`agent:update-branch\`: branch is already up to date with \`origin/${BASE_REF}\`. No update needed.`,
    );
    console.log("Already up to date; nothing to push.");
  } else if (mergeBase !== head) {
    fail(
      "Branch histories have diverged. No merge or rebase was attempted. Read the target repository's contribution rules and complete a separately authorized, policy-compliant update before retrying. This automatic stage only permits fast-forward updates.",
    );
  } else {
    if (git("status", "--porcelain")) {
      fail(
        "The working tree is not clean. Preserve and reconcile changes before retrying.",
      );
    }
    // An immutable descendant and --ff-only prohibit creating a merge commit.
    git("merge", "--ff-only", "--no-edit", base);
    if (git("rev-parse", "HEAD") !== base) {
      fail(
        "The branch changed during the fast-forward update. Reconcile before publication.",
      );
    }
    writeText(
      "comment.md",
      `\`agent:update-branch\`: fast-forwarded \`${BRANCH}\` to \`origin/${BASE_REF}\` (\`${base.slice(0, 7)}\`) without creating or rewriting commits.`,
    );
    writeText("should_push.txt", "true");
    console.log("Fast-forward complete; wrapper may publish the branch.");
  }
} catch {
  fail(
    "Could not safely determine or complete a fast-forward update. Check the repository state and base ref before retrying. No branch publication was authorized.",
  );
}
