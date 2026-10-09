/**
 * Test server for E2E tests.
 * Creates a temporary dirty git repository with real git commands.
 */
import { serve } from "bun";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import index from "../src/index.html";
import { createAppConfig } from "../server/app.ts";
import { createGitService, defaultCommandRunner } from "../server/git.ts";
import { createCmuxService, createDryRunConnector } from "../server/cmux.ts";
import { createGitHubService } from "../server/github.ts";
import { createFileWatcher, defaultWatcherFactory } from "../server/watcher.ts";
import { loadActions } from "../server/actions.ts";

const PORT = 14568;

// Create a temporary dirty git repo
// Named folder so the file browser breadcrumb reads "demo-project" in screenshots
const repoDir = join(mkdtempSync(join(tmpdir(), "cmux-hub-e2e-")), "demo-project");
mkdirSync(repoDir);

function gitInRepo(cmd: string) {
  execSync(`git ${cmd}`, { cwd: repoDir, stdio: "pipe" });
}

// Initialize repo with a base commit
gitInRepo("init");
gitInRepo("config user.email 'test@test.com'");
gitInRepo("config user.name 'Test'");
writeFileSync(join(repoDir, "hello.ts"), 'export const greeting = "hello";\n');
// 1x1 PNG and a README referencing it, for the file browser preview
writeFileSync(
  join(repoDir, "logo.png"),
  Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  ),
);
writeFileSync(
  join(repoDir, "README.md"),
  [
    "# Demo project",
    "",
    '<img src="logo.png" alt="logo" width="48">',
    "",
    "A small project used by the **alp-hub** end-to-end tests.",
    "",
    "## Getting started",
    "",
    "- Install dependencies with `bun install`",
    "- Run the tests with `bun test`",
    "",
    "```ts",
    'export const greeting = "hello";',
    "```",
    "",
    "| File | Purpose |",
    "| --- | --- |",
    "| `hello.ts` | Greeting constant |",
    "| `logo.png` | Project logo |",
    "",
  ].join("\n"),
);
gitInRepo("add .");
gitInRepo("commit -m 'initial commit'");

// Create a feature branch with changes
gitInRepo("checkout -b feature/test");
writeFileSync(
  join(repoDir, "hello.ts"),
  'export const greeting = "hello world";\nexport const version = 1;\n',
);
writeFileSync(join(repoDir, "new-file.ts"), 'export function newModule() {\n  return "new";\n}\n');
// Add a large file to enable scroll position testing
const largeFileLines = Array.from({ length: 100 }, (_, i) => `export const line${i} = ${i};`).join(
  "\n",
);
writeFileSync(join(repoDir, "large-file.ts"), largeFileLines + "\n");
gitInRepo("add .");

// Export repoDir so tests can modify files
export { repoDir };

const git = createGitService(defaultCommandRunner, repoDir);
const cmux = createCmuxService(createDryRunConnector());
const github = createGitHubService(defaultCommandRunner, repoDir);
const watcher = createFileWatcher(defaultWatcherFactory, repoDir);

const app = createAppConfig({
  port: PORT,
  git,
  cmux,
  github,
  cwd: repoDir,
  watcher,
  defaultSurfaceId: "surface:e2e-test",
  // The menu alp-hub ships, so screenshots show the real toolbar
  actions: await loadActions(
    join(import.meta.dirname, "..", "cmux-hub-plugin", "defaults", "actions.json"),
  ),
});

const server = serve({
  port: PORT,
  hostname: "127.0.0.1",
  routes: {
    ...app.apiRoutes,
    "/": index,
  },
  websocket: app.websocket,
  fetch: app.fetch,
  development: false,
});

app.setServer(server);
app.startWatcher();

console.log(`E2E test server running at http://127.0.0.1:${PORT}`);
console.log(`Test repo: ${repoDir}`);
