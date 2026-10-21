import { notFound } from "next/navigation";
import { HELP_LABELS } from "../../../../src/core/help.ts";
import { loadDashboard, loadExerciseDetail, loadRun, recommendation } from "../../../../src/dashboard/index.ts";
import { listWorkspace, solutionDir } from "../../../../src/dashboard/workspace.ts";
import { formatDate, source } from "../../../lib/data.ts";
import { Command, Workbench } from "../../client.tsx";
import { HintPanel } from "../../hints.tsx";
import { CalibrationBadge, PassBadge, Score, StateBadge } from "../../components.tsx";
import { RunView } from "../../run-view.tsx";

export const dynamic = "force-dynamic";

export default async function ExercisePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const src = source();
  const detail = await loadExerciseDetail(src, id);
  if (!detail) notFound();
  const { exercise, row, runs, hints } = detail;
  const dashboard = await loadDashboard(src);
  const listing = await listWorkspace(solutionDir(src.workspaceDir, exercise), exercise.solution);
  const latest = runs[0] ? await loadRun(src, runs[0].id) : null;
  const next = recommendation(dashboard);
  const review = dashboard.due.find((r) => r.entry.exerciseId === exercise.id);
  return (
    <>
      <h1>{exercise.title}</h1>
      <p className="muted">
        <code>{exercise.id}</code> · {row.level} · {exercise.skill} · {exercise.type} · best <Score score={row.best} />{" "}
        <StateBadge state={row.state} /> <CalibrationBadge state={row.calibration} />
      </p>
      {review && (
        <p>
          <span className="badge warn">review due</span>{" "}
          {review.entry.lastPassed
            ? "You passed this last time: start over and solve it from memory."
            : "You didn't pass last time: continue where you left off."}
          {review.entry.missed.length > 0 && <span className="muted"> Missed last time: {review.entry.missed.join(", ")}</span>}
        </p>
      )}
      {exercise.playbook && (
        <p>
          Routine and prompt template: <a href={`/playbooks/${exercise.playbook}`}>playbook {exercise.playbook}</a>
        </p>
      )}
      {exercise.source && <p className="muted">Generated from: {exercise.source}</p>}

      <h2>Task</h2>
      <div className="card">
        <pre className="task">{exercise.body}</pre>
      </div>

      {exercise.criteria.length > 0 && (
        <details>
          <summary>Rubric the judge grades against</summary>
          <ul>
            {exercise.criteria.map((c) => (
              <li key={c.id}>
                <code>{c.id}</code> (weight {c.weight}): {c.text}
              </li>
            ))}
          </ul>
        </details>
      )}

      <h2>Your solution</h2>
      <p className="muted">
        Edit <code>{exercise.solution}</code> in your workspace. In a terminal: <Command text={`dojo run ${exercise.id}`} />
      </p>
      <Workbench
        exerciseId={exercise.id}
        solution={exercise.solution}
        initial={listing}
        needsApi={row.needsApi}
        suggestFresh={review?.entry.lastPassed ?? false}
      />

      <h2>Stuck?</h2>
      <p className="muted">
        Hints come in steps: first what to focus on, then a stronger nudge, and last the solution with why it works. In a terminal:{" "}
        <Command text={`dojo hint ${exercise.id}`} />
      </p>
      {/* A new run remounts it: the hints read your latest run. */}
      <HintPanel key={runs.length} exerciseId={exercise.id} next={hints.next} solutionUnlocked={hints.solutionUnlocked} />

      {latest && (
        <>
          <h2>
            Latest run <span className="muted">{formatDate(latest.run.startedAt)}</span>
          </h2>
          <RunView detail={latest} />
        </>
      )}

      {next && next.id !== exercise.id && (
        <div className="card hero next">
          <div>
            <div className="muted">{next.kind === "review" ? "Next: a review that is due" : "Next on the path"}</div>
            <h3>
              <a href={`/exercises/${next.id}`}>{next.title}</a>
            </h3>
          </div>
          <a className="button primary" href={`/exercises/${next.id}`}>
            Continue
          </a>
        </div>
      )}

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
                <th>Help</th>
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
                  <td className="muted">{HELP_LABELS[r.help]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
