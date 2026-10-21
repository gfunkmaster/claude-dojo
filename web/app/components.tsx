import type { CalibrationState, ExerciseState, TrendPoint } from "../../src/dashboard/index.ts";
import { PASS_SCORE } from "../../src/core/scoring.ts";

export function Score({ score }: { score: number | null }) {
  if (score === null) return <span className="muted">-</span>;
  return <span>{score}</span>;
}

const STATE_LABEL: Record<ExerciseState, string> = { passed: "passed", attempted: "not passed", new: "new" };

export function StateBadge({ state }: { state: ExerciseState }) {
  return <span className={`badge ${state === "passed" ? "pass" : state}`}>{STATE_LABEL[state]}</span>;
}

export function CalibrationBadge({ state }: { state: CalibrationState }) {
  if (state === "yes") return <span className="badge pass">calibrated</span>;
  if (state === "unreliable") return <span className="badge fail">UNRELIABLE</span>;
  return <span className="badge plain">not calibrated</span>;
}

export function GradeBadge({ grade }: { grade: "pass" | "partial" | "fail" }) {
  return <span className={`badge ${grade}`}>{grade}</span>;
}

export function PassBadge({ passed }: { passed: boolean }) {
  return <span className={`badge ${passed ? "pass" : "fail"}`}>{passed ? "pass" : "fail"}</span>;
}

/** Score per run, oldest first, on a 0-100 scale with the pass line dashed. */
export function Sparkline({ points }: { points: TrendPoint[] }) {
  const w = 240;
  const h = 56;
  const pad = 4;
  const y = (score: number) => pad + (1 - score / 100) * (h - 2 * pad);
  const x = (i: number) => (points.length < 2 ? w / 2 : pad + (i / (points.length - 1)) * (w - 2 * pad));
  const label = points.length === 0 ? "No runs yet" : `Scores: ${points.map((p) => p.score).join(", ")}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={label}>
      <line x1={0} x2={w} y1={y(PASS_SCORE)} y2={y(PASS_SCORE)} stroke="var(--chart-grid)" strokeDasharray="4 4" />
      {points.length > 1 && (
        <polyline
          fill="none"
          stroke="var(--chart)"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
          points={points.map((p, i) => `${x(i)},${y(p.score)}`).join(" ")}
        />
      )}
      {points.map((p, i) => (
        <a key={p.runId} href={`/runs/${p.runId}`}>
          <circle cx={x(i)} cy={y(p.score)} r={3} fill="var(--chart)">
            <title>{`${p.exerciseId}: ${p.score} (${p.at.slice(0, 10)})`}</title>
          </circle>
        </a>
      ))}
    </svg>
  );
}
