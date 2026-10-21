import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { ScheduleSchema, type Schedule } from "../core/schedule.ts";

/** Writes the snapshot atomically, so a reader never sees half a file. */
export async function writeSchedule(file: string, schedule: Schedule): Promise<void> {
  const valid = ScheduleSchema.parse(schedule);
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(valid, null, 2) + "\n");
  await rename(tmp, file);
}

/** null when the file is missing or doesn't validate. It is derived data: rebuild it from the results. */
export async function readSchedule(file: string): Promise<Schedule | null> {
  try {
    const parsed = ScheduleSchema.safeParse(JSON.parse(await readFile(file, "utf8")));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
