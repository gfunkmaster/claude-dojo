import { loadPlaybooks } from "../../../src/dashboard/playbooks.ts";
import { source } from "../../lib/data.ts";
import { Command } from "../client.tsx";

export const dynamic = "force-dynamic";

export default async function PlaybooksPage() {
  const playbooks = await loadPlaybooks(source().playbooksDir);
  return (
    <>
      <h1>Playbooks</h1>
      <p className="muted">Working routines for the three kinds of ticket, each with a prompt template to paste into Claude Code.</p>
      <ul className="plain playbooks">
        {playbooks.map((p) => (
          <li key={p.name} className="card">
            <h3>
              <a href={`/playbooks/${p.name}`}>{p.name}</a>
            </h3>
            <div>{p.summary}</div>
            <div className="muted">
              <Command text={`dojo playbook ${p.name}`} />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
