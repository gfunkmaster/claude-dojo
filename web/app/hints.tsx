"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { HintLevel } from "../../src/core/help.ts";
import type { Hint, HintFile } from "../../src/core/hints.ts";
import { CopyButton } from "./client.tsx";

interface HintPanelProps {
  exerciseId: string;
  /** The level the next hint gives; 3 means only the solution is left. */
  next: HintLevel;
  solutionUnlocked: boolean;
}

function Files({ files }: { files: HintFile[] }) {
  return (
    <>
      {files.map((f) => (
        <div key={f.path} className="code-block">
          <div className="muted">
            <code>{f.path}</code>
          </div>
          <CopyButton text={f.content} />
          <pre className="log">{f.content}</pre>
        </div>
      ))}
    </>
  );
}

function HintView({ hint }: { hint: Hint }) {
  const title = hint.level === 1 ? "Hint 1: what to focus on" : hint.level === 2 ? "Hint 2: a stronger nudge" : "The solution";
  return (
    <div className="card hint">
      <h3>{title}</h3>
      {hint.basedOn === null && <p className="muted">You haven't been graded yet, so this is what the judge weighs most.</p>}
      {hint.judgeSkipped && <p className="muted">The judge was skipped last time: too few checks passed. Fix the checks first.</p>}
      {hint.failedChecks.length > 0 && !hint.solution && (
        <>
          <p>Checks that failed last time:</p>
          <ul>
            {hint.failedChecks.map((c, i) => (
              <li key={i}>
                {c.case}: <code>{c.check}</code>
                {c.detail && <span className="muted"> — {c.detail}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
      {hint.focus.length > 0 && !hint.solution && (
        <>
          <p>{hint.basedOn !== null && !hint.judgeSkipped ? "Criteria you missed, most important first:" : "Criteria, most important first:"}</p>
          <ul className="criteria">
            {hint.focus.map((f) => (
              <li key={f.id}>
                {f.grade && <span className={`badge ${f.grade}`}>{f.grade}</span>} <code>{f.id}</code> (weight {f.weight}): {f.text}
                {f.reasoning && <div className="muted">Judge: {f.reasoning}</div>}
                {f.tip && <div>Tip: {f.tip}</div>}
              </li>
            ))}
          </ul>
        </>
      )}
      {hint.nudges.length > 0 && !hint.solution && (
        <ul>
          {hint.nudges.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      )}
      {hint.outline.length > 0 && !hint.solution && (
        <>
          <p>The reference solution, each line cut to its first words:</p>
          {hint.outline.map((o) => (
            <div key={o.path}>
              <div className="muted">
                <code>{o.path}</code> ({o.lines} lines)
              </div>
              <pre className="log">{o.skeleton.join("\n")}</pre>
            </div>
          ))}
        </>
      )}
      {hint.solution && (
        <>
          <p>
            Reference solution, graded {hint.solution.expect.good[0]}–{hint.solution.expect.good[1]} when calibrated:
          </p>
          <Files files={hint.solution.files} />
          <p>Why it works:</p>
          <ul>
            {hint.solution.explanation.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
          {hint.solution.contrast.length > 0 && (
            <details>
              <summary>
                For contrast: the bad reference
                {hint.solution.expect.bad && ` (graded ${hint.solution.expect.bad[0]}–${hint.solution.expect.bad[1]})`}
              </summary>
              <Files files={hint.solution.contrast} />
            </details>
          )}
          <p className="muted">
            A pass graded within a day of this doesn't move the exercise up in the review schedule or count toward mastery. To make it
            stick, start over tomorrow and write it from memory.
          </p>
        </>
      )}
    </div>
  );
}

/**
 * Help in steps. Nothing is in the page until you ask: each button fetches one hint
 * from the server, which records that you saw it.
 */
export function HintPanel({ exerciseId, next: initialNext, solutionUnlocked }: HintPanelProps) {
  const router = useRouter();
  const [next, setNext] = useState<HintLevel>(initialNext);
  const [shown, setShown] = useState<Hint[]>([]);
  const [loading, setLoading] = useState<HintLevel | null>(null);
  const [error, setError] = useState<string | null>(null);

  const ask = async (level: HintLevel) => {
    if (level === 3 && !confirm("Show the reference solution? A pass in the next day then won't move the exercise up.")) return;
    setError(null);
    setLoading(level);
    try {
      const res = await fetch(`/api/exercises/${exerciseId}/hint`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ level }),
      });
      const body = (await res.json()) as Hint | { error?: string };
      if (!res.ok || !("level" in body)) throw new Error(("error" in body && body.error) || `HTTP ${res.status}`);
      setShown((s) => [...s.filter((h) => h.level !== body.level), body].sort((a, b) => a.level - b.level));
      if (level < 3 && level >= next) setNext((level + 1) as HintLevel);
      // The runs table marks the help you had.
      if (level === 3) router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(null);
    }
  };

  const hintLevel: 1 | 2 = next >= 2 ? 2 : 1;
  return (
    <div className="hints">
      <div className="actions">
        <button type="button" disabled={loading !== null} onClick={() => ask(hintLevel)}>
          {loading === 1 || loading === 2 ? "Fetching…" : next === 3 ? "Hint 2 again" : `Get hint ${hintLevel}`}
        </button>
        <button type="button" disabled={loading !== null || !solutionUnlocked} onClick={() => ask(3)}>
          {loading === 3 ? "Fetching…" : "Show solution"}
        </button>
      </div>
      {!solutionUnlocked && <p className="muted">The solution unlocks after your first graded attempt.</p>}
      {error && <p className="error">{error}</p>}
      {shown.map((h) => (
        <HintView key={h.level} hint={h} />
      ))}
    </div>
  );
}
