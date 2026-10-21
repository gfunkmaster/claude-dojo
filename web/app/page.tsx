import { loadDashboard } from "../../src/dashboard/index.ts";
import { formatDate, source, usd } from "../lib/data.ts";
import { PassBadge, Score, Sparkline } from "./components.tsx";

export const dynamic = "force-dynamic";

export default async function Overview() {
  const d = await loadDashboard(source());
  const skipped = d.exercises.filter((e) => e.needsApi).length;
  return (
    <>
      <h1>Overview</h1>
      <div className="stats">
        <div className="stat">
          <div className="value">
            {d.totals.passed}/{d.totals.exercises}
          </div>
          <div className="label">exercises passed</div>
        </div>
        <div className="stat">
          <div className="value">{d.totals.runs}</div>
          <div className="label">runs</div>
        </div>
        <div className="stat">
          <div className="value">{usd(d.totals.costUsd)}</div>
          <div className="label">API list price of all runs</div>
        </div>
      </div>

      <h2>Next new exercise</h2>
      <div className="card hero">
        {d.next ? (
          <div>
            <h3>
              <a href={`/exercises/${d.next.id}`}>{d.next.title}</a>
            </h3>
            <div className="muted">
              {d.next.position}/{d.totals.exercises} · {d.next.level} · {d.next.skill}
              {d.next.best !== null && ` · best so far ${d.next.best}`}
            </div>
          </div>
        ) : (
          <div>You have passed every exercise you can run on this backend.</div>
        )}
        {d.next && <code className="cmd">dojo run {d.next.id}</code>}
      </div>
      {skipped > 0 && (
        <p className="muted">{skipped} tools/request exercises are skipped: they need API credits (DOJO_BACKEND=api).</p>
      )}

      {d.due.length > 0 && (
        <>
          <h2>Due for review</h2>
          <p className="muted"><code>dojo next</code> starts with these before new exercises.</p>
          <div className="card">
            <ul className="plain">
              {d.due.map(({ entry, title, command }) => (
                <li key={entry.exerciseId}>
                  <a href={`/exercises/${entry.exerciseId}`}>{title}</a>{" "}
                  <span className="muted">
                    due {formatDate(entry.dueAt)} · last {entry.lastScore}
                    {entry.missed.length > 0 && ` · missed ${entry.missed.join(", ")}`}
                  </span>{" "}
                  <code>{command}</code>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      <h2>Skills</h2>
      <div className="grid">
        {d.skills.map((s) => (
          <div className="card skill-card" key={s.skill}>
            <div className="top">
              <h3>
                <a href={`/exercises?skill=${s.skill}`}>{s.skill}</a>
              </h3>
              <span className="score">
                <Score score={s.last} />
              </span>
            </div>
            <Sparkline points={s.trend} />
            <div className="muted">
              {s.passed}/{s.total} passed · {s.runs} {s.runs === 1 ? "run" : "runs"} · best <Score score={s.best} />
            </div>
            {s.mostMissed.length > 0 && (
              <div className="muted">Most missed: {s.mostMissed.map((m) => `${m.id} (${m.count})`).join(", ")}</div>
            )}
          </div>
        ))}
      </div>

      <h2>Recent runs</h2>
      {d.recentRuns.length === 0 ? (
        <p className="muted">
          No runs yet. Start with <code>dojo next</code>.
        </p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Exercise</th>
                <th>Skill</th>
                <th className="num">Score</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {d.recentRuns.map((r) => (
                <tr key={r.id}>
                  <td>
                    <a href={`/runs/${r.id}`}>{formatDate(r.startedAt)}</a>
                  </td>
                  <td>{r.title}</td>
                  <td>{r.skill}</td>
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

      {d.warnings.length > 0 && (
        <>
          <h2>Warnings</h2>
          <div className="card warnings">
            <ul className="plain">
              {d.warnings.map((w) => (
                <li key={w}>
                  <code>{w}</code>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </>
  );
}
