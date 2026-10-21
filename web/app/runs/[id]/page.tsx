import { notFound } from "next/navigation";
import { loadRun } from "../../../../src/dashboard/index.ts";
import { formatDate, source } from "../../../lib/data.ts";
import { RunView } from "../../run-view.tsx";

export const dynamic = "force-dynamic";

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await loadRun(source(), id);
  if (!detail) notFound();
  const { run, title } = detail;
  return (
    <>
      <h1>
        <a href={`/exercises/${run.exerciseId}`}>{title}</a>
      </h1>
      <p className="muted">
        {formatDate(run.startedAt)} · {run.skill} · {run.type} · {(run.durationMs / 1000).toFixed(1)} s
      </p>
      <RunView detail={detail} />
    </>
  );
}
