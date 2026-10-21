import { exerciseRoots, refuse, repoRoot, source } from "../../../../../lib/data.ts";
import { isHintLevel } from "../../../../../../src/core/help.ts";
import { fetchHint, HintError } from "../../../../../../src/dashboard/runner.ts";
import { findExercise } from "../../../../../../src/dashboard/workspace.ts";

export const dynamic = "force-dynamic";

/**
 * A hint (`{ level: 1 | 2 | 3 }`, 3 is the solution), from `dojo hint --json`, which
 * also records that you saw it. A POST, because seeing a hint changes your record.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/exercises/[id]/hint">) {
  const refused = refuse(request, true);
  if (refused) return refused;
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return Response.json({ error: "expected application/json" }, { status: 415 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const level = (body as { level?: unknown } | null)?.level;
  if (!isHintLevel(level)) return Response.json({ error: "level must be 1, 2 or 3" }, { status: 400 });
  const exercise = await findExercise(exerciseRoots(source()), (await ctx.params).id);
  if (!exercise) return Response.json({ error: "unknown exercise" }, { status: 404 });
  try {
    const hint = await fetchHint({ repoRoot: repoRoot() }, exercise.id, level);
    return Response.json(hint, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    if (err instanceof HintError) return Response.json({ error: err.message }, { status: 409 });
    throw err;
  }
}
