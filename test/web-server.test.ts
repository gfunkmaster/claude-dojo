import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { cleanEnv } from "../src/checks/index.ts";
import { loadDashboard, loadReview, recommendation, type DashboardSource } from "../src/dashboard/index.ts";
import { isLocalHost, refuseNonLocal } from "../src/dashboard/local.ts";
import { loadPlaybook, loadPlaybooks, splitFences } from "../src/dashboard/playbooks.ts";
import { RunBusyError, runArgs, Runner, type RunEvent } from "../src/dashboard/runner.ts";
import {
  cleanRelativePath,
  findExercise,
  isExerciseId,
  listWorkspace,
  MAX_FILE_BYTES,
  solutionDir,
  WorkspacePathError,
  writeWorkspaceFile,
} from "../src/dashboard/workspace.ts";
import type { RunResult } from "../src/core/result.ts";
import { JsonResultStore } from "../src/store/json-store.ts";
import { EXERCISES_DIR, PLAYBOOKS_DIR, tempDir } from "./helpers.ts";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");

async function read(stream: ReadableStream<Uint8Array>): Promise<RunEvent[]> {
  const text = await new Response(stream).text();
  return text
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as RunEvent);
}

test("only localhost may read, and only this UI's own pages may write", () => {
  const ok = { host: "127.0.0.1:4321", origin: "http://127.0.0.1:4321", fetchSite: "same-origin" };
  assert.equal(refuseNonLocal(ok, true), null);
  assert.equal(refuseNonLocal({ host: "localhost:4321", origin: null, fetchSite: "none" }, false), null);
  assert.ok(isLocalHost("[::1]:4321"));

  // DNS rebinding: the attacker's name resolves to 127.0.0.1, but the Host header gives it away.
  assert.match(refuseNonLocal({ ...ok, host: "evil.example:4321" }, false) ?? "", /localhost/);
  assert.ok(refuseNonLocal({ ...ok, host: "localhost.evil.example" }, false));
  assert.ok(refuseNonLocal({ ...ok, host: "192.168.1.5:4321" }, false));
  assert.ok(refuseNonLocal({ ...ok, host: null }, false));

  // CSRF: another site's form or fetch.
  assert.ok(refuseNonLocal({ ...ok, origin: "http://evil.example", fetchSite: "cross-site" }, true));
  assert.ok(refuseNonLocal({ ...ok, origin: "http://evil.example", fetchSite: null }, true));
  assert.ok(refuseNonLocal({ ...ok, origin: "http://localhost:9999" }, true));
  assert.ok(refuseNonLocal({ ...ok, origin: "null" }, true));
  assert.ok(refuseNonLocal({ ...ok, origin: null }, true), "a write without Origin is refused");
  assert.ok(refuseNonLocal({ ...ok, fetchSite: "same-site" }, true));
});

test("exercise ids are checked before they reach the file system", async () => {
  assert.ok(isExerciseId("prompting-few-shot-tone"));
  for (const bad of ["../etc", "a/b", "", "A", "x y", "a\0", "--help", "-x"]) assert.equal(isExerciseId(bad), false, bad);
  assert.equal(await findExercise([EXERCISES_DIR], "../../etc"), null);
  assert.equal(await findExercise([EXERCISES_DIR], "no-such-exercise"), null);
  assert.equal((await findExercise([EXERCISES_DIR], "prompting-few-shot-tone"))?.solution, "system.md");
  assert.throws(() => solutionDir("/ws", { id: "../x" }));
});

test("workspace paths stay inside the workspace", () => {
  assert.equal(cleanRelativePath("system.md"), "system.md");
  assert.equal(cleanRelativePath("a//b/c.md"), "a/b/c.md");
  for (const bad of ["../x", "a/../../x", "/etc/passwd", "C:/x", "a\\..\\x", "./", "", "a\0b", ".git/config", "node_modules/x"]) {
    assert.throws(() => cleanRelativePath(bad), WorkspacePathError, bad);
  }
});

test("the editor lists and saves text files, and never writes outside the workspace", async () => {
  const home = await tempDir();
  const dir = path.join(home, "workspace", "ex");
  assert.deepEqual(await listWorkspace(dir), { started: false, files: [], skipped: [] });
  await assert.rejects(writeWorkspaceFile(dir, "system.md", "x"), /start the exercise first/);

  await mkdir(path.join(dir, "notes"), { recursive: true });
  await writeFile(path.join(dir, "a.txt"), "a");
  await writeFile(path.join(dir, "system.md"), "prompt");
  await writeFile(path.join(dir, "image.bin"), Buffer.from([1, 0, 2]));
  await mkdir(path.join(dir, ".git"));
  await writeFile(path.join(dir, ".git", "HEAD"), "ref");

  const outside = path.join(home, "outside");
  await mkdir(outside);
  await writeFile(path.join(outside, "secret.txt"), "secret");
  await symlink(path.join(outside, "secret.txt"), path.join(dir, "link.txt"));
  await symlink(outside, path.join(dir, "linked-dir"));

  const listing = await listWorkspace(dir, "system.md");
  assert.equal(listing.started, true);
  assert.deepEqual(listing.files.map((f) => f.path), ["system.md", "a.txt"]);
  assert.deepEqual(listing.skipped.sort(), ["image.bin", "link.txt", "linked-dir"]);

  assert.equal(await writeWorkspaceFile(dir, "system.md", "new prompt"), "system.md");
  assert.equal(await readFile(path.join(dir, "system.md"), "utf8"), "new prompt");
  await writeWorkspaceFile(dir, "notes/deep/plan.md", "plan");
  assert.equal(await readFile(path.join(dir, "notes", "deep", "plan.md"), "utf8"), "plan");

  // Neither a symlinked file nor a symlinked folder leads out.
  await assert.rejects(writeWorkspaceFile(dir, "link.txt", "pwned"));
  await assert.rejects(writeWorkspaceFile(dir, "linked-dir/new.txt", "pwned"), WorkspacePathError);
  await assert.rejects(writeWorkspaceFile(dir, "linked-dir/a/b.txt", "pwned"), WorkspacePathError);
  await assert.rejects(writeWorkspaceFile(dir, "../escape.txt", "pwned"), WorkspacePathError);
  assert.equal(await readFile(path.join(outside, "secret.txt"), "utf8"), "secret");
  await assert.rejects(writeWorkspaceFile(dir, "big.txt", "x".repeat(MAX_FILE_BYTES + 1)), /KB/);
});

test("a run is `node src/cli/bin.ts run <id>` with one of three fixed flags", () => {
  const bin = path.join("/repo", "src", "cli", "bin.ts");
  assert.deepEqual(runArgs("/repo", "ex-1", "run"), [bin, "run", "ex-1"]);
  assert.deepEqual(runArgs("/repo", "ex-1", "fresh"), [bin, "run", "ex-1", "--fresh"]);
  assert.deepEqual(runArgs("/repo", "ex-1", "calibrate"), [bin, "run", "ex-1", "--calibrate"]);
  assert.throws(() => runArgs("/repo", "--help", "run"));
  assert.throws(() => runArgs("/repo", "ex-1", "--keep" as never));
});

test("the runner streams output and the exit code, one run at a time, without a shell", async () => {
  const calls: { command: string; args: string[]; shell: unknown }[] = [];
  const runner = new Runner({
    repoRoot: REPO_ROOT,
    env: { PATH: process.env.PATH, NODE_OPTIONS: "--inspect" },
    spawn: (command, args, options) => {
      calls.push({ command, args, shell: options.shell });
      assert.equal(options.env?.NODE_OPTIONS, undefined);
      return spawn(process.execPath, ["-e", "console.log('Grading ex-1…'); console.error('warn'); console.log('Score 80/100'); process.exitCode = 3"], options);
    },
  });
  const stream = runner.start("ex-1", "run");
  assert.deepEqual(runner.running, { id: "ex-1", mode: "run" });
  assert.throws(() => runner.start("ex-2", "run"), RunBusyError);
  const events = await read(stream);
  assert.equal(runner.running, null);
  assert.deepEqual(calls[0]?.args, runArgs(REPO_ROOT, "ex-1", "run"));
  assert.equal(calls[0]?.shell, false);
  const lines = events.filter((e) => e.type === "line").map((e) => (e.type === "line" ? e.text : ""));
  assert.deepEqual(lines.filter((l) => l !== "warn"), ["Grading ex-1…", "Score 80/100"]);
  assert.ok(lines.includes("warn"));
  assert.deepEqual(events.at(-1), { type: "exit", code: 3 });

  // A command that can't start is reported, and frees the runner.
  const broken = new Runner({ repoRoot: "/repo", node: path.join(await tempDir(), "no-such-node") });
  const failed = await read(broken.start("ex-1", "run"));
  assert.equal(failed.at(-1)?.type, "exit");
  const last = failed.at(-1);
  assert.ok(last?.type === "exit" && last.error);
  assert.equal(broken.running, null);
});

test("starting an exercise from the UI runs the real CLI and copies the starter", async () => {
  const home = await tempDir();
  const runner = new Runner({ repoRoot: REPO_ROOT, env: { ...cleanEnv(), DOJO_HOME: home, DOJO_BACKEND: "claude-cli" } });
  const events = await read(runner.start("prompting-few-shot-tone", "run"));
  assert.deepEqual(events.at(-1), { type: "exit", code: 0 });
  assert.ok(events.some((e) => e.type === "line" && e.text.startsWith("Your workspace:")));
  const listing = await listWorkspace(path.join(home, "workspace", "prompting-few-shot-tone"), "system.md");
  assert.equal(listing.files[0]?.path, "system.md");
});

test("playbooks are listed, and split so every prompt template can be copied", async () => {
  const rows = await loadPlaybooks(PLAYBOOKS_DIR);
  assert.deepEqual(rows.map((r) => r.name), ["feature", "bugfix", "research"]);
  assert.ok(rows.every((r) => r.summary.length > 0));
  const bugfix = await loadPlaybook(PLAYBOOKS_DIR, "bugfix");
  assert.ok(bugfix?.segments.some((s) => s.kind === "code" && s.lang === "text" && s.text.startsWith("Bugg:")));
  assert.equal(await loadPlaybook(PLAYBOOKS_DIR, "../AGENTS"), null);

  assert.deepEqual(splitFences("# T\n\nintro\n\n```sh\nnpm test\n```\nafter\n```\nopen"), [
    { kind: "text", text: "# T\n\nintro" },
    { kind: "code", lang: "sh", text: "npm test" },
    { kind: "text", text: "after" },
    { kind: "code", lang: "", text: "open" },
  ]);
});

const run = (id: string, startedAt: string, score: number): RunResult => ({
  schemaVersion: 1,
  exerciseId: id,
  skill: "prompting",
  type: "prompt",
  startedAt,
  durationMs: 1,
  score,
  passed: score >= 70,
  checkScore: 1,
  judgeScore: null,
  cases: [],
  criteria: [],
  failedCriteria: [],
  summary: "",
  tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  costUsd: 0,
  turns: 1,
  models: [],
  solutionHash: "x",
});

test("the review page and the 'next' card pick what `dojo review` and `dojo next` would", async () => {
  const home = await tempDir();
  const src: DashboardSource = {
    repoRoot: REPO_ROOT,
    exercisesDir: EXERCISES_DIR,
    generatedDir: path.join(home, "generated"),
    store: new JsonResultStore(path.join(home, "results")),
    workspaceDir: path.join(home, "workspace"),
    playbooksDir: PLAYBOOKS_DIR,
    backend: "claude-cli",
  };
  const now = new Date("2026-10-21T12:00:00.000Z");
  assert.equal(recommendation(await loadDashboard(src, now))?.kind, "new");

  await src.store.saveRun(run("prompting-few-shot-tone", "2026-10-10T09:00:00.000Z", 90));
  await src.store.saveRun({ ...run("tools-describe-tools", "2026-10-10T09:00:00.000Z", 30), skill: "tools", type: "tools" });
  await src.store.saveRun(run("prompt-extract-invoice", "2026-10-21T09:00:00.000Z", 90));

  const review = await loadReview(src, now);
  assert.deepEqual(review.due.map((r) => r.entry.exerciseId), ["prompting-few-shot-tone"]);
  assert.deepEqual(review.upcoming.map((r) => r.entry.exerciseId), ["prompt-extract-invoice"]);
  assert.deepEqual(review.skipped.map((r) => r.entry.exerciseId), ["tools-describe-tools"]);

  assert.deepEqual(recommendation(await loadDashboard(src, now)), {
    id: "prompting-few-shot-tone",
    title: review.due[0]?.title,
    kind: "review",
    fresh: true,
  });
});
