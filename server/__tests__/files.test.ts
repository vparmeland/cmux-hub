import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, symlinkSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { createGitService, defaultCommandRunner, type GitService } from "../git.ts";
import { createAppConfig } from "../app.ts";
import { createCmuxService, createDryRunConnector } from "../cmux.ts";
import { createGitHubService } from "../github.ts";

// Real git repository so ls-files, .gitignore and symlinks behave as in production
describe("file browser (listFiles / readFile)", () => {
  let repo: string;
  let outside: string;
  let git: GitService;

  beforeAll(() => {
    repo = mkdtempSync(path.join(tmpdir(), "cmux-hub-files-"));
    outside = mkdtempSync(path.join(tmpdir(), "cmux-hub-outside-"));
    writeFileSync(path.join(outside, "secret.txt"), "secret\n");
    execSync("git init -q", { cwd: repo });
    mkdirSync(path.join(repo, "src"));
    writeFileSync(path.join(repo, "src", "app.ts"), "export const a = 1;\n");
    writeFileSync(path.join(repo, ".gitignore"), "ignored.txt\n");
    writeFileSync(path.join(repo, "ignored.txt"), "nope\n");
    writeFileSync(path.join(repo, "image.bin"), Buffer.from([0x89, 0x50, 0x00, 0x01]));
    writeFileSync(path.join(repo, "big.txt"), "x".repeat(1024 * 1024 + 1));
    symlinkSync(path.join(outside, "secret.txt"), path.join(repo, "escape.txt"));
    execSync("git add src/app.ts .gitignore", { cwd: repo });
    git = createGitService(defaultCommandRunner, repo);
  });

  test("listFiles returns tracked and untracked files but not ignored ones", async () => {
    const files = await git.listFiles();
    expect(files).toContain("src/app.ts");
    expect(files).toContain("image.bin");
    expect(files).not.toContain("ignored.txt");
  });

  test("readFile returns text content", async () => {
    const file = await git.readFile("src/app.ts");
    expect(file.content).toBe("export const a = 1;\n");
    expect(file.reason).toBeUndefined();
  });

  test("readFile flags binary and oversized files without returning content", async () => {
    expect(await git.readFile("image.bin")).toMatchObject({ content: null, reason: "binary" });
    expect(await git.readFile("big.txt")).toMatchObject({ content: null, reason: "too-large" });
  });

  test("readFile rejects paths outside the listed files", async () => {
    for (const p of ["ignored.txt", "../secret.txt", path.join(outside, "secret.txt"), "src"]) {
      await expect(git.readFile(p)).rejects.toThrow("File not found in repository");
    }
  });

  test("readFile rejects a listed symlink that points outside the repository", async () => {
    expect(await git.listFiles()).toContain("escape.txt");
    await expect(git.readFile("escape.txt")).rejects.toThrow("Path outside repository");
  });
});

describe("GET /api/file/raw", () => {
  const PORT = 14571;
  let app: ReturnType<typeof createAppConfig>;

  beforeAll(() => {
    const repo = mkdtempSync(path.join(tmpdir(), "cmux-hub-raw-"));
    execSync("git init -q", { cwd: repo });
    writeFileSync(path.join(repo, "logo.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    writeFileSync(path.join(repo, "evil.svg"), "<svg><script>alert(1)</script></svg>");
    writeFileSync(path.join(repo, "app.ts"), "export {};\n");
    app = createAppConfig({
      port: PORT,
      git: createGitService(defaultCommandRunner, repo),
      cmux: createCmuxService(createDryRunConnector()),
      github: createGitHubService(defaultCommandRunner, repo),
      cwd: repo,
    });
  });

  afterAll(() => app.stop());

  const get = (filePath: string) => {
    const route = app.apiRoutes["/api/file/raw"] as { GET: (req: Request) => Promise<Response> };
    return route.GET(
      new Request(`http://127.0.0.1:${PORT}/api/file/raw?path=${encodeURIComponent(filePath)}`, {
        headers: { host: `127.0.0.1:${PORT}` },
      }),
    );
  };

  test("serves image bytes with a locked-down policy", async () => {
    const res = await get("logo.png");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
    );
  });

  test("sandboxes SVG so embedded scripts cannot run", async () => {
    const res = await get("evil.svg");
    expect(res.headers.get("content-type")).toBe("image/svg+xml");
    expect(res.headers.get("content-security-policy")).toContain("sandbox");
    expect(res.headers.get("content-security-policy")).toContain("default-src 'none'");
  });

  test("refuses non-image files and paths outside the repository", async () => {
    expect((await get("app.ts")).status).toBe(415);
    expect((await get("../outside.png")).status).toBe(404);
  });
});
