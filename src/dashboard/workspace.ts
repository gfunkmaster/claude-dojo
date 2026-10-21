import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { loadExercises, type Exercise } from "../core/exercise.ts";

/**
 * The files of your solution, as the web UI's editor sees them. Everything here
 * stays inside `<workspaceDir>/<exercise id>`: paths are checked by name and
 * again after resolving symlinks, so neither `../` nor a link can reach out.
 */

/** The exercise schema's `id` rule, and it can't start with `-`, so it never reads as a CLI flag. */
const EXERCISE_ID = /^[a-z0-9][a-z0-9-]*$/;
/** The editor is a textarea: anything larger than this isn't hand-edited. */
export const MAX_FILE_BYTES = 256 * 1024;
const MAX_FILES = 200;
const SKIP_DIRS = new Set([".git", "node_modules"]);

export function isExerciseId(id: string): boolean {
  return id.length <= 100 && EXERCISE_ID.test(id);
}

/** The exercise with this id, or null. The id is checked before it touches the file system. */
export async function findExercise(roots: string[], id: string): Promise<Exercise | null> {
  if (!isExerciseId(id)) return null;
  const { exercises } = await loadExercises(roots);
  return exercises.find((e) => e.id === id) ?? null;
}

export function solutionDir(workspaceDir: string, exercise: Pick<Exercise, "id">): string {
  if (!isExerciseId(exercise.id)) throw new Error(`invalid exercise id: ${exercise.id}`);
  return path.join(workspaceDir, exercise.id);
}

export class WorkspacePathError extends Error {}

/**
 * A path the user typed, made safe: relative, forward slashes, no `.`/`..`
 * segments, no NUL. Throws WorkspacePathError otherwise.
 */
export function cleanRelativePath(rel: string): string {
  if (typeof rel !== "string" || rel.length === 0 || rel.length > 500) throw new WorkspacePathError("invalid path");
  if (rel.includes("\0") || rel.includes("\\")) throw new WorkspacePathError("invalid path");
  if (path.posix.isAbsolute(rel) || /^[a-z]:/i.test(rel)) throw new WorkspacePathError("the path must be relative to the workspace");
  const parts = rel.split("/").filter((p) => p !== "");
  if (parts.length === 0 || parts.some((p) => p === "." || p === "..")) {
    throw new WorkspacePathError("the path must stay inside the workspace");
  }
  if (parts.some((p) => SKIP_DIRS.has(p))) throw new WorkspacePathError(`${rel} is not editable here`);
  return parts.join("/");
}

function inside(child: string, root: string): boolean {
  const rel = path.relative(root, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

async function exists(p: string): Promise<boolean> {
  try {
    await lstat(p);
    return true;
  } catch {
    return false;
  }
}

/** The real path of `dir`, or null when it doesn't exist (the exercise hasn't been started). */
async function realRoot(dir: string): Promise<string | null> {
  try {
    if (!(await stat(dir)).isDirectory()) return null;
    return await realpath(dir);
  } catch {
    return null;
  }
}

/** The nearest existing ancestor must resolve inside the root: an existing symlinked folder can't lead out. */
async function assertParentInside(root: string, file: string): Promise<void> {
  let dir = path.dirname(file);
  while (!(await exists(dir))) dir = path.dirname(dir);
  if (!inside(await realpath(dir), root)) throw new WorkspacePathError("the path leaves the workspace");
}

export interface WorkspaceFile {
  path: string;
  content: string;
}

export interface WorkspaceListing {
  /** False until the exercise has been started (its starter copied). */
  started: boolean;
  files: WorkspaceFile[];
  /** Files left out of the editor: binary, too large, symlinks, or past the limit. */
  skipped: string[];
}

/** Text files of the workspace, the solution file first. */
export async function listWorkspace(dir: string, solution?: string): Promise<WorkspaceListing> {
  const root = await realRoot(dir);
  if (!root) return { started: false, files: [], skipped: [] };
  const files: WorkspaceFile[] = [];
  const skipped: string[] = [];
  const walk = async (abs: string, rel: string) => {
    const entries = await readdir(abs, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      const relPath = rel ? `${rel}/${e.name}` : e.name;
      const full = path.join(abs, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) await walk(full, relPath);
      } else if (!e.isFile()) {
        skipped.push(relPath);
      } else if (files.length >= MAX_FILES || (await stat(full)).size > MAX_FILE_BYTES) {
        skipped.push(relPath);
      } else {
        const buf = await readFile(full);
        if (buf.includes(0)) skipped.push(relPath);
        else files.push({ path: relPath, content: buf.toString("utf8") });
      }
    }
  };
  await walk(root, "");
  if (solution) files.sort((a, b) => Number(b.path === solution) - Number(a.path === solution));
  return { started: true, files, skipped };
}

/**
 * Writes one file of the workspace. The workspace must exist (start the exercise
 * first), the path must stay inside it, and an existing symlink is never followed.
 */
export async function writeWorkspaceFile(dir: string, rel: string, content: string): Promise<string> {
  const clean = cleanRelativePath(rel);
  if (typeof content !== "string") throw new WorkspacePathError("content must be text");
  if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES) {
    throw new WorkspacePathError(`files over ${MAX_FILE_BYTES / 1024} KB can't be edited here`);
  }
  const root = await realRoot(dir);
  if (!root) throw new WorkspacePathError("start the exercise first: its workspace doesn't exist yet");
  // A local tool, never deployed: don't let Next trace the whole repo for this.
  const file = path.join(/* turbopackIgnore: true */ root, ...clean.split("/"));
  if (!inside(file, root)) throw new WorkspacePathError("the path leaves the workspace");
  await assertParentInside(root, file);
  await mkdir(path.dirname(file), { recursive: true });
  // O_NOFOLLOW: if the file itself is a symlink, the open fails instead of writing through it.
  const handle = await open(file, constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | constants.O_NOFOLLOW, 0o644);
  try {
    await handle.writeFile(content, "utf8");
  } finally {
    await handle.close();
  }
  return clean;
}
