import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { HintEventSchema, type HintEvent } from "../core/help.ts";
import { CalibrationSchema, RunResultSchema, type Calibration, type RunResult } from "../core/result.ts";

/** Storage seam: phase 4 can swap this for a database without touching the core. */
export interface ResultStore {
  saveRun(result: RunResult): Promise<string>;
  listRuns(exerciseId?: string): Promise<RunResult[]>;
  saveCalibration(calibration: Calibration): Promise<string>;
  getCalibration(exerciseId: string): Promise<Calibration | null>;
  /** Records a hint you looked at (`results/hints/`). Append-only, like runs. */
  saveHint(event: HintEvent): Promise<string>;
  listHints(exerciseId?: string): Promise<HintEvent[]>;
}

export class JsonResultStore implements ResultStore {
  private readonly root: string;

  constructor(root: string) {
    this.root = root;
  }

  async saveRun(result: RunResult): Promise<string> {
    const valid = RunResultSchema.parse(result);
    await mkdir(this.root, { recursive: true });
    const stamp = valid.startedAt.replace(/[:.]/g, "-");
    const file = path.join(this.root, `${stamp}_${valid.exerciseId}.json`);
    // Append-only: `wx` refuses to overwrite an existing run.
    await writeFile(file, JSON.stringify(valid, null, 2) + "\n", { flag: "wx" });
    return file;
  }

  async listRuns(exerciseId?: string): Promise<RunResult[]> {
    const runs = await readAll(this.root, RunResultSchema);
    return runs.filter((r) => !exerciseId || r.exerciseId === exerciseId);
  }

  async saveHint(event: HintEvent): Promise<string> {
    const valid = HintEventSchema.parse(event);
    const dir = path.join(this.root, "hints");
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, `${valid.at.replace(/[:.]/g, "-")}_${valid.exerciseId}_${valid.level}.json`);
    await writeFile(file, JSON.stringify(valid, null, 2) + "\n", { flag: "wx" });
    return file;
  }

  async listHints(exerciseId?: string): Promise<HintEvent[]> {
    const hints = await readAll(path.join(this.root, "hints"), HintEventSchema);
    return hints.filter((h) => !exerciseId || h.exerciseId === exerciseId);
  }

  async saveCalibration(calibration: Calibration): Promise<string> {
    const valid = CalibrationSchema.parse(calibration);
    const dir = path.join(this.root, "calibration");
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, `${valid.exerciseId}.json`);
    await writeFile(file, JSON.stringify(valid, null, 2) + "\n");
    return file;
  }

  async getCalibration(exerciseId: string): Promise<Calibration | null> {
    try {
      const raw = await readFile(path.join(this.root, "calibration", `${exerciseId}.json`), "utf8");
      return CalibrationSchema.parse(JSON.parse(raw));
    } catch {
      return null;
    }
  }
}

/** Every valid `*.json` in `dir`, in file name (= time) order. */
async function readAll<T>(dir: string, schema: { safeParse(v: unknown): { success: true; data: T } | { success: false } }): Promise<T[]> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const out: T[] = [];
  for (const name of names.filter((n) => n.endsWith(".json")).sort()) {
    let json: unknown;
    try {
      json = JSON.parse(await readFile(path.join(dir, name), "utf8"));
    } catch {
      // A truncated or hand-edited file is skipped like one with the wrong schema.
      continue;
    }
    const parsed = schema.safeParse(json);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}
