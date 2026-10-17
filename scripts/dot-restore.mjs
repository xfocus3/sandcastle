// Restore a request into an otherwise clean, disposable clone of the same repo.
// This does not run project code, build, test, fetch from a new URL, or publish.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

const [requestFile, destination] = process.argv.slice(2);
if (!requestFile || !destination)
  throw new Error(
    "Usage: node scripts/dot-restore.mjs request.json disposable-clone",
  );
const { hash, ...request } = JSON.parse(fs.readFileSync(requestFile, "utf8"));
if (createHash("sha256").update(JSON.stringify(request)).digest("hex") !== hash)
  throw new Error("Request hash mismatch");
const root = fs.realpathSync(destination);
const git = (args, input) =>
  execFileSync("git", args, { cwd: root, input, maxBuffer: 128 * 1024 * 1024 });
if (git(["status", "--porcelain", "--untracked-files=all"]).length)
  throw new Error("Use a clean disposable clone");
const snapshot = request.snapshot;
if (!/^[0-9a-f]{40}$/.test(snapshot.head))
  throw new Error("Invalid snapshot head");
const directory = fs.mkdtempSync(path.join(root, ".git", "dot-restore-"));
try {
  if (snapshot.bundle) {
    const bundle = path.join(directory, "commits.bundle");
    fs.writeFileSync(bundle, Buffer.from(snapshot.bundle, "base64"));
    git(["bundle", "unbundle", bundle]);
  }
  git(["cat-file", "-e", `${snapshot.head}^{commit}`]);
  git(["checkout", "--detach", snapshot.head]);
  for (const line of snapshot.refs.split("\n").filter(Boolean)) {
    const [sha, ref] = line.split(" ");
    if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error("Invalid snapshot ref");
    if (ref.startsWith("refs/heads/")) {
      git(["check-ref-format", ref]);
      git(["update-ref", ref, sha]);
    }
  }
  git(["unpack-objects", "-r"], Buffer.from(snapshot.indexObjects, "base64"));
  git(["read-tree", "--empty"]);
  git(["update-index", "-z", "--index-info"], snapshot.index);
  for (const file of snapshot.files) {
    if (
      !file.path ||
      path.isAbsolute(file.path) ||
      file.path.split(/[\\/]/).some((p) => p === ".." || p === ".git")
    )
      throw new Error("Unsafe snapshot path");
    const target = path.join(root, file.path);
    const parent = path.dirname(target);
    let ancestor = root;
    for (const segment of path
      .relative(root, parent)
      .split(path.sep)
      .filter(Boolean)) {
      ancestor = path.join(ancestor, segment);
      if (fs.existsSync(ancestor)) {
        if (
          fs.lstatSync(ancestor).isSymbolicLink() ||
          !fs.lstatSync(ancestor).isDirectory()
        )
          throw new Error("Unsafe snapshot ancestor");
      } else fs.mkdirSync(ancestor);
    }
    fs.rmSync(target, { force: true });
    if (file.link !== undefined) {
      if (
        path.isAbsolute(file.link) ||
        !path.resolve(parent, file.link).startsWith(root + path.sep)
      )
        throw new Error("Unsafe snapshot symlink");
      fs.symlinkSync(file.link, target);
    } else if (file.data !== undefined) {
      fs.writeFileSync(target, Buffer.from(file.data, "base64"));
      fs.chmodSync(target, file.mode & 0o777);
    }
  }
  for (const [name, content] of Object.entries(snapshot.merge)) {
    if (
      ![
        "MERGE_HEAD",
        "MERGE_MSG",
        "MERGE_MODE",
        "CHERRY_PICK_HEAD",
        "REVERT_HEAD",
      ].includes(name)
    )
      throw new Error("Invalid merge metadata");
    const file = git(["rev-parse", "--git-path", name]).toString().trim();
    fs.writeFileSync(path.resolve(root, file), content);
  }
  console.log(`Restored dot request ${request.id} at ${snapshot.head}`);
} finally {
  fs.rmSync(directory, { recursive: true, force: true });
}
