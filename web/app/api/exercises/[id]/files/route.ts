import { exerciseRoots, refuse, source } from "../../../../../lib/data.ts";
import { findExercise, listWorkspace, solutionDir, WorkspacePathError, writeWorkspaceFile } from "../../../../../../src/dashboard/workspace.ts";

export const dynamic = "force-dynamic";

/** The text files of your solution. */
export async function GET(request: Request, ctx: RouteContext<"/api/exercises/[id]/files">) {
  const refused = refuse(request, false);
  if (refused) return refused;
  const src = source();
  const exercise = await findExercise(exerciseRoots(src), (await ctx.params).id);
  if (!exercise) return Response.json({ error: "unknown exercise" }, { status: 404 });
  return Response.json(await listWorkspace(solutionDir(src.workspaceDir, exercise), exercise.solution));
}

/** Saves one file: `{ path, content }`, path relative to the workspace. */
export async function PUT(request: Request, ctx: RouteContext<"/api/exercises/[id]/files">) {
  const refused = refuse(request, true);
  if (refused) return refused;
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return Response.json({ error: "expected application/json" }, { status: 415 });
  }
  const src = source();
  const exercise = await findExercise(exerciseRoots(src), (await ctx.params).id);
  if (!exercise) return Response.json({ error: "unknown exercise" }, { status: 404 });
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid JSON" }, { status: 400 });
  }
  const { path, content } = (body ?? {}) as { path?: unknown; content?: unknown };
  if (typeof path !== "string" || typeof content !== "string") {
    return Response.json({ error: "expected { path, content } as strings" }, { status: 400 });
  }
  try {
    const saved = await writeWorkspaceFile(solutionDir(src.workspaceDir, exercise), path, content);
    return Response.json({ saved });
  } catch (err) {
    if (err instanceof WorkspacePathError) return Response.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
