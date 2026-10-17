import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { expect, it } from "vitest";

it("does not duplicate a posted comment when retrying after label failure", () => {
  const dir = mkdtempSync(join(tmpdir(), "sandcastle-apply-"));
  try {
    writeFileSync(join(dir, "batch.json"), JSON.stringify([{ number: 1 }]));
    writeFileSync(join(dir, "plan.json"), JSON.stringify({
      issues: [{ number: 1, tag: "needs-a-human", duplicate_of: null, comment: "Verified findings." }],
      patterns: "",
    }));
    writeFileSync(join(dir, "state.json"), JSON.stringify({ comments: [], attempts: 0 }));
    writeFileSync(join(dir, "gh"), `#!/usr/bin/env node
const fs = require("node:fs");
const file = process.env.FAKE_STATE;
const state = JSON.parse(fs.readFileSync(file, "utf8"));
const args = process.argv.slice(2);
if (args[0] === "api") {
  process.stdout.write(JSON.stringify([state.comments]));
} else if (args[1] === "list") {
  process.stdout.write('[{"number":1}]');
} else if (args[1] === "comment") {
  state.comments.push({ body: fs.readFileSync(0, "utf8"), user: { login: "github-actions[bot]" } });
  fs.writeFileSync(file, JSON.stringify(state));
} else if (args[1] === "edit") {
  state.attempts++;
  fs.writeFileSync(file, JSON.stringify(state));
  if (state.attempts === 1) process.exit(1);
} else { process.exit(2); }
`, { mode: 0o755 });
    const run = () => spawnSync(process.execPath, ["--import", "tsx", resolve(".sandcastle/agent-workflows/explore/apply.ts")], {
      encoding: "utf8",
      env: { ...process.env, PATH: dir + ":" + process.env.PATH, FAKE_STATE: join(dir, "state.json"),
        BATCH_FILE: join(dir, "batch.json"), PLAN_FILE: join(dir, "plan.json"), GH_REPO: "example/project",
        OUTPUT_DIR: dir, GITHUB_STEP_SUMMARY: join(dir, "summary.md"), DRY_RUN: "false", AGENT_PAT: "" },
    });
    expect(run().status).toBe(1);
    const retry = run();
    expect(retry.status, retry.stderr).toBe(0);
    const state = JSON.parse(readFileSync(join(dir, "state.json"), "utf8"));
    expect(state.attempts).toBe(2);
    expect(state.comments).toHaveLength(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 30000);
