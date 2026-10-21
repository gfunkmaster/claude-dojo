import { exerciseRoots, refuse, repoRoot, source } from "../../../../../lib/data.ts";
import { isRunMode, RunBusyError, sharedRunner } from "../../../../../../src/dashboard/runner.ts";
import { findExercise } from "../../../../../../src/dashboard/workspace.ts";

export const dynamic = "force-dynamic";

/** Runs `dojo run <id>` (`{ mode: "run" | "fresh" | "calibrate" }`) and streams its output as JSON lines. */
export async function POST(request: Request, ctx: RouteContext<"/api/exercises/[id]/run">) {
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
  const mode = (body as { mode?: unknown } | null)?.mode;
  if (!isRunMode(mode)) return Response.json({ error: "mode must be run, fresh or calibrate" }, { status: 400 });
  const exercise = await findExercise(exerciseRoots(source()), (await ctx.params).id);
  if (!exercise) return Response.json({ error: "unknown exercise" }, { status: 404 });
  try {
    const stream = sharedRunner(repoRoot()).start(exercise.id, mode);
    return new Response(stream, {
      headers: {
        "content-type": "application/x-ndjson; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (err) {
    if (err instanceof RunBusyError) return Response.json({ error: err.message }, { status: 409 });
    throw err;
  }
}
