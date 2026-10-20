import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { CalibrationSchema, RunResultSchema, type Calibration, type RunResult } from "../core/result.ts";

/** Storage seam: phase 4 can swap this for a database without touching the core. */
export interface ResultStore {
  saveRun(result: RunResult): Promise<string>;
  listRuns(exerciseId?: string): Promise<RunResult[]>;
  saveCalibration(calibration: Calibration): Promise<string>;
  getCalibration(exerciseId: string): Promise<Calibration | null>;
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
    let names: string[];
    try {
      names = await readdir(this.root);
    } catch {
      return [];
    }
    const runs: RunResult[] = [];
    for (const name of names.filter((n) => n.endsWith(".json")).sort()) {
      const parsed = RunResultSchema.safeParse(JSON.parse(await readFile(path.join(this.root, name), "utf8")));
      if (parsed.success && (!exerciseId || parsed.data.exerciseId === exerciseId)) runs.push(parsed.data);
    }
    return runs;
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
