import { LEVELS, SKILLS } from "../../../src/core/exercise.ts";
import { loadDashboard } from "../../../src/dashboard/index.ts";
import { formatDate, source } from "../../lib/data.ts";
import { CalibrationBadge, Score, StateBadge } from "../components.tsx";

export const dynamic = "force-dynamic";

export default async function Exercises({ searchParams }: { searchParams: Promise<{ skill?: string }> }) {
  const { skill } = await searchParams;
  const d = await loadDashboard(source());
  const shown = d.exercises.filter((e) => !skill || e.skill === skill);
  return (
    <>
      <h1>Exercises</h1>
      <p className="muted">The path in the order <code>dojo next</code> takes it. 70 or more is a pass.</p>
      <div className="filters">
        <a href="/exercises" className={skill ? "" : "active"}>
          all
        </a>
        {SKILLS.map((s) => (
          <a key={s} href={`/exercises?skill=${s}`} className={skill === s ? "active" : ""}>
            {s}
          </a>
        ))}
      </div>
      {LEVELS.map((level, i) => {
        const rows = shown.filter((e) => e.difficulty === i + 1);
        if (rows.length === 0) return null;
        return (
          <section key={level}>
            <h2>
              {level} <span className="muted">({rows.filter((r) => r.state === "passed").length}/{rows.length} passed)</span>
            </h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th className="num">#</th>
                    <th>Exercise</th>
                    <th>Skill</th>
                    <th>Type</th>
                    <th>Status</th>
                    <th className="num">Best</th>
                    <th className="num">Runs</th>
                    <th>Last run</th>
                    <th>Calibration</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={e.id}>
                      <td className="num">{e.position}</td>
                      <td>
                        <a href={`/exercises/${e.id}`}>{e.title}</a>
                        <div className="muted">
                          <code>{e.id}</code>
                          {e.generated && " · yours"}
                          {e.needsApi && " · needs API"}
                        </div>
                      </td>
                      <td>{e.skill}</td>
                      <td>{e.type}</td>
                      <td>
                        <StateBadge state={e.state} />
                      </td>
                      <td className="num">
                        <Score score={e.best} />
                      </td>
                      <td className="num">{e.runs}</td>
                      <td>{e.lastRunAt ? formatDate(e.lastRunAt) : <span className="muted">-</span>}</td>
                      <td>
                        <CalibrationBadge state={e.calibration} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </>
  );
}
