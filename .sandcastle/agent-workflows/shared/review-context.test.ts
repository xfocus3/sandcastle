import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { gh, safeSh, sh } from "./common";
import { fetchPullRequestContext } from "./review-context";

vi.mock("./common", () => ({
  gh: vi.fn(),
  safeSh: vi.fn(),
  sh: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("GH_REPO", "owner/repo");
  vi.mocked(safeSh).mockReturnValue("");
  vi.mocked(sh).mockReturnValue("");
  vi.mocked(gh).mockImplementation((args) => {
    if (args[0] === "pr") {
      return JSON.stringify({ title: "Fix pagination", body: "Closes #1", comments: [] });
    }
    if (args[0] === "issue") {
      return JSON.stringify({
        title: "Pagination regression",
        body: "Reproduce using the fetched child predicate.",
        comments: [{ body: "Preserve the unpaginated control." }],
      });
    }
    if (args[1] === "graphql") {
      return JSON.stringify({ data: { repository: { pullRequest: { reviewThreads: { nodes: [] } } } } });
    }
    if (args[1]?.endsWith("/reviews")) return "[]";
    throw new Error("Unexpected GitHub request");
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("linked issue review context", () => {
  it("includes the linked issue title, body and comments", () => {
    const context = fetchPullRequestContext("2");
    expect(context.issueTitle).toBe("Pagination regression");
    expect(context.linkedIssue).toContain("fetched child predicate");
    expect(context.linkedIssue).toContain("unpaginated control");
    expect(gh).toHaveBeenCalledWith(["issue", "view", "1", "--json", "title,body,comments"]);
  });

  it("refuses to review when a linked issue cannot be read", () => {
    const original = vi.mocked(gh).getMockImplementation()!;
    vi.mocked(gh).mockImplementation((args) => {
      if (args[0] === "issue") throw new Error("Issue access denied");
      return original(args);
    });
    expect(() => fetchPullRequestContext("2")).toThrow("Issue access denied");
  });
});
