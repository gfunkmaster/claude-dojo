import type { RunDetail } from "../../src/dashboard/index.ts";
import { usd } from "../lib/data.ts";
import { GradeBadge, PassBadge } from "./components.tsx";

/** One graded run: score, checks, judge feedback, tokens. On its own page and under the editor. */
export function RunView({ detail }: { detail: RunDetail }) {
  const { run, totalTokens } = detail;
  const checks = run.cases.flatMap((c) => c.checks);
  return (
    <>
      <div className="stats">
        <div className="stat">
          <div className="value">
            {run.score} <PassBadge passed={run.passed} />
          </div>
          <div className="label">score</div>
        </div>
        <div className="stat">
          <div className="value">
            {checks.filter((c) => c.passed).length}/{checks.length}
          </div>
          <div className="label">checks passed</div>
        </div>
        <div className="stat">
          <div className="value">{run.judgeScore === null ? "-" : `${Math.round(run.judgeScore * 100)}%`}</div>
          <div className="label">judge</div>
        </div>
        <div className="stat">
          <div className="value">{totalTokens.toLocaleString("en-US")}</div>
          <div className="label">
            tokens (in {run.tokens.input}, out {run.tokens.output}, cache read {run.tokens.cacheRead}, write{" "}
            {run.tokens.cacheWrite})
          </div>
        </div>
        <div className="stat">
          <div className="value">{run.turns}</div>
          <div className="label">turns</div>
        </div>
        <div className="stat">
          <div className="value">{usd(run.costUsd)}</div>
          <div className="label">cost at API list price</div>
        </div>
      </div>

      {run.summary && (
        <>
          <h2>Summary</h2>
          <div className="card">
            <pre className="task">{run.summary}</pre>
          </div>
        </>
      )}

      <h2>Checks</h2>
      {run.cases.map((c) => (
        <div key={c.name} className="table-wrap">
          <h3>{c.name}</h3>
          <table>
            <tbody>
              {c.checks.map((check, i) => (
                <tr key={i}>
                  <td>
                    <PassBadge passed={check.passed} />
                  </td>
                  <td>
                    <code>{check.check}</code>
                  </td>
                  <td className="muted">{check.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      <h2>Judge</h2>
      {run.judgeNote && <p className="muted">{run.judgeNote}</p>}
      {run.criteria.length === 0 ? (
        <p className="muted">The judge did not grade this run.</p>
      ) : (
        <ul className="plain criteria">
          {run.criteria.map((c) => (
            <li key={c.id} className="card">
              <h3>
                <GradeBadge grade={c.grade} /> <code>{c.id}</code> <span className="muted">weight {c.weight}</span>
              </h3>
              <div>{c.reasoning}</div>
              {c.grade !== "pass" && c.tip && (
                <div>
                  <strong>Tip:</strong> {c.tip}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="muted">
        Models: {run.models.join(", ")} · solution <code>{run.solutionHash.slice(0, 12)}</code>
      </p>
    </>
  );
}
