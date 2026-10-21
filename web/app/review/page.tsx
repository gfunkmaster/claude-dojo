import { loadReview, type DueReview } from "../../../src/dashboard/index.ts";
import { relativeDays } from "../../../src/core/schedule.ts";
import { source } from "../../lib/data.ts";
import { Command } from "../client.tsx";

export const dynamic = "force-dynamic";

function Rows({ reviews, now, commands }: { reviews: DueReview[]; now: Date; commands: boolean }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Exercise</th>
            <th>Skill</th>
            <th className="num">Box</th>
            <th className="num">Last</th>
            <th>Due</th>
            <th>Missed last time</th>
            {commands && <th>Terminal</th>}
          </tr>
        </thead>
        <tbody>
          {reviews.map(({ entry, title, command }) => (
            <tr key={entry.exerciseId}>
              <td>
                <a href={`/exercises/${entry.exerciseId}`}>{title}</a>
              </td>
              <td>{entry.skill}</td>
              <td className="num">{entry.box}</td>
              <td className="num">
                {entry.lastScore}
                {entry.lastPassed ? "" : " ✗"}
              </td>
              <td>{relativeDays(entry.dueAt, now)}</td>
              <td className="muted">{entry.missed.join(", ") || "-"}</td>
              {commands && (
                <td>
                  <Command text={command} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function ReviewPage() {
  const now = new Date();
  const { due, upcoming, skipped } = await loadReview(source(), now);
  return (
    <>
      <h1>Review</h1>
      <p className="muted">
        Spaced repetition, built from your runs like <code>dojo review</code>. A passed exercise comes back after 1, 3, 7, 14
        and 30 days; a fail brings it back tomorrow. Open one to solve it: a passed one starts over from the starter
        (<code>--fresh</code>), a failed one continues where you left off.
      </p>
      {due.length === 0 && upcoming.length === 0 ? (
        <p>Nothing to review yet: exercises join the schedule after their first graded run.</p>
      ) : (
        <>
          <h2>Due now ({due.length})</h2>
          {due.length === 0 ? <p>Nothing due. Well done.</p> : <Rows reviews={due} now={now} commands />}
          {upcoming.length > 0 && (
            <>
              <h2>Coming up</h2>
              <Rows reviews={upcoming} now={now} commands={false} />
            </>
          )}
        </>
      )}
      {skipped.length > 0 && (
        <>
          <h2>Due, but they need API credits</h2>
          <Rows reviews={skipped} now={now} commands={false} />
        </>
      )}
    </>
  );
}
