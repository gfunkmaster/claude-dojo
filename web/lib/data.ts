import path from "node:path";
import { defaultSource, type DashboardSource } from "../../src/dashboard/index.ts";

/** Same files as the CLI: DOJO_HOME, DOJO_EXERCISES and DOJO_BACKEND work here too. */
export function source(): DashboardSource {
  return defaultSource(process.env.DOJO_REPO_ROOT ?? path.resolve(process.cwd(), ".."));
}

export function formatDate(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
}

export function usd(n: number): string {
  return `$${n.toFixed(4)}`;
}
