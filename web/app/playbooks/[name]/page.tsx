import { notFound } from "next/navigation";
import { loadPlaybook } from "../../../../src/dashboard/playbooks.ts";
import { source } from "../../../lib/data.ts";
import { CopyButton } from "../../client.tsx";

export const dynamic = "force-dynamic";

export default async function PlaybookPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const playbook = await loadPlaybook(source().playbooksDir, name);
  if (!playbook) notFound();
  return (
    <>
      <p>
        <a href="/playbooks">Playbooks</a> / {playbook.name} <CopyButton text={playbook.markdown} label="Copy all" />
      </p>
      {playbook.segments.map((s, i) =>
        s.kind === "text" ? (
          <pre key={i} className="task prose">
            {s.text}
          </pre>
        ) : (
          <div key={i} className="card code-block">
            <CopyButton text={s.text} />
            <pre>{s.text}</pre>
          </div>
        ),
      )}
    </>
  );
}
