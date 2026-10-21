import { notFound } from "next/navigation";
import { loadExerciseDetail } from "../../../../src/dashboard/index.ts";
import { formatDate, source } from "../../../lib/data.ts";
import { CalibrationBadge, PassBadge, Score, StateBadge } from "../../components.tsx";

export const dynamic = "force-dynamic";

export default async function ExercisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = await loadExerciseDetail(source(), id);
  if (!detail) notFound();
  const { exercise, row, runs } = detail;
  return (
    <>
      <h1>{exercise.title}</h1>
      <p className="muted">
        <code>{exercise.id}</code> · {row.level} · {exercise.skill} · {exercise.type} · best <Score score={row.best} />{" "}
        <StateBadge state={row.state} /> <CalibrationBadge state={row.calibration} />
      </p>
      <p>
        <code className="cmd">dojo run {exercise.id}</code>
        {row.needsApi && <span className="muted"> needs API credits (DOJO_BACKEND=api)</span>}
      </p>
      {exercise.source && <p className="muted">Generated from: {exercise.source}</p>}

      <h2>Runs</h2>
      {runs.length === 0 ? (
        <p className="muted">No runs yet.</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th className="num">Score</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td>
                    <a href={`/runs/${r.id}`}>{formatDate(r.startedAt)}</a>
                  </td>
                  <td className="num">{r.score}</td>
                  <td>
                    <PassBadge passed={r.passed} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>Task</h2>
      <div className="card">
        <pre className="task">{exercise.body}</pre>
      </div>

      {exercise.criteria.length > 0 && (
        <>
          <h2>Rubric</h2>
          <ul>
            {exercise.criteria.map((c) => (
              <li key={c.id}>
                <code>{c.id}</code> (weight {c.weight}): {c.text}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
