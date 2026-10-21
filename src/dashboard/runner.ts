import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import path from "node:path";
import { isExerciseId } from "./workspace.ts";

/**
 * Runs `dojo run` for the web UI, as a child process. The CLI stays the only
 * thing that grades, writes results and refreshes the schedule; the UI only
 * streams its output. Nothing from the request reaches the command line except
 * a validated exercise id and one of three fixed modes, and no shell is involved.
 */

export const RUN_MODES = ["run", "fresh", "calibrate"] as const;
export type RunMode = (typeof RUN_MODES)[number];

export function isRunMode(mode: unknown): mode is RunMode {
  return typeof mode === "string" && (RUN_MODES as readonly string[]).includes(mode);
}

/** Arguments after `node`. Throws on an id or mode that didn't come through validation. */
export function runArgs(repoRoot: string, id: string, mode: RunMode): string[] {
  if (!isExerciseId(id)) throw new Error(`invalid exercise id: ${id}`);
  if (!isRunMode(mode)) throw new Error(`invalid mode: ${String(mode)}`);
  const flags = mode === "fresh" ? ["--fresh"] : mode === "calibrate" ? ["--calibrate"] : [];
  return [path.join(repoRoot, "src", "cli", "bin.ts"), "run", id, ...flags];
}

/** What the browser reads, one JSON object per line. */
export type RunEvent = { type: "line"; text: string } | { type: "exit"; code: number | null; error?: string };

export type Spawn = (command: string, args: string[], options: SpawnOptions) => ChildProcess;

export interface RunnerOptions {
  repoRoot: string;
  /** Defaults to the Node that runs the server, which strips the CLI's types. */
  node?: string;
  spawn?: Spawn;
  env?: NodeJS.ProcessEnv;
  /** An env exercise can take minutes; this only stops one that hangs. */
  timeoutMs?: number;
}

export class RunBusyError extends Error {}

/**
 * One grading at a time: two runs would share `claude` and the results folder,
 * and the subscription's rate limits. A run outlives the browser tab that
 * started it, so closing the page never loses a grade.
 */
export class Runner {
  private current: { id: string; mode: RunMode } | null = null;
  private readonly opts: RunnerOptions;

  constructor(opts: RunnerOptions) {
    this.opts = opts;
  }

  get running(): { id: string; mode: RunMode } | null {
    return this.current;
  }

  /** Starts the run and returns its output as a stream of RunEvent lines. Throws RunBusyError while another runs. */
  start(id: string, mode: RunMode): ReadableStream<Uint8Array> {
    if (this.current) throw new RunBusyError(`already running ${this.current.id}`);
    const args = runArgs(this.opts.repoRoot, id, mode);
    const spawn = this.opts.spawn ?? nodeSpawn;
    const env = { ...(this.opts.env ?? process.env) };
    // The dev server's own flags (inspector, memory limits) are not the CLI's business.
    delete env.NODE_OPTIONS;
    const child = spawn(this.opts.node ?? process.execPath, args, {
      cwd: this.opts.repoRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    this.current = { id, mode };
    const encoder = new TextEncoder();
    let open = true;
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const send = (e: RunEvent) => {
      if (!open) return;
      try {
        controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      } catch {
        open = false;
      }
    };
    const lines = (chunkSource: NodeJS.ReadableStream | null) => {
      let buffered = "";
      chunkSource?.setEncoding("utf8");
      chunkSource?.on("data", (chunk: string) => {
        buffered += chunk;
        const parts = buffered.split("\n");
        buffered = parts.pop() ?? "";
        for (const text of parts) send({ type: "line", text });
      });
      chunkSource?.on("end", () => {
        if (buffered) send({ type: "line", text: buffered });
        buffered = "";
      });
    };
    const timer = setTimeout(() => child.kill("SIGTERM"), this.opts.timeoutMs ?? 20 * 60 * 1000);
    let done = false;
    const finish = (code: number | null, error?: string) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      this.current = null;
      send(error ? { type: "exit", code, error } : { type: "exit", code });
      if (open) controller.close();
      open = false;
    };
    return new ReadableStream<Uint8Array>({
      start: (c) => {
        controller = c;
        lines(child.stdout);
        lines(child.stderr);
        child.on("error", (err) => finish(null, err.message));
        // "close", not "exit": by then stdout and stderr are fully read.
        child.on("close", (code) => finish(code));
      },
      cancel: () => {
        // The tab went away. Let the grading finish; it saves its own result.
        open = false;
      },
    });
  }
}

/** One runner per server process, kept across hot reloads in `next dev`. */
export function sharedRunner(repoRoot: string): Runner {
  const g = globalThis as { __dojoRunner?: Runner };
  return (g.__dojoRunner ??= new Runner({ repoRoot }));
}
