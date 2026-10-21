import path from "node:path";
import { defaultSource, type DashboardSource } from "../../src/dashboard/index.ts";
import { headersOf, refuseNonLocal } from "../../src/dashboard/local.ts";

export function repoRoot(): string {
  return process.env.DOJO_REPO_ROOT ?? path.resolve(process.cwd(), "..");
}

/** Same files as the CLI: DOJO_HOME, DOJO_EXERCISES and DOJO_BACKEND work here too. */
export function source(): DashboardSource {
  return defaultSource(repoRoot());
}

/** A 403 for a request that isn't from this UI on localhost, or null. Every API route calls it first. */
export function refuse(request: Request, write: boolean): Response | null {
  const reason = refuseNonLocal(headersOf(request), write);
  return reason ? Response.json({ error: reason }, { status: 403 }) : null;
}

export function formatDate(iso: string): string {
  return iso.slice(0, 16).replace("T", " ");
}

export function usd(n: number): string {
  return `$${n.toFixed(4)}`;
}

/** The bundled path plus your generated exercises, as the CLI looks for them. */
export function exerciseRoots(src: DashboardSource): string[] {
  return [src.exercisesDir, src.generatedDir];
}
