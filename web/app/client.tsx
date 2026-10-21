"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { RunEvent, RunMode } from "../../src/dashboard/runner.ts";
import type { WorkspaceFile, WorkspaceListing } from "../../src/dashboard/workspace.ts";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="copy"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // Clipboard access can be refused; the text is still on the page to select.
        }
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}

/** A command to paste in a terminal, with a copy button. */
export function Command({ text }: { text: string }) {
  return (
    <span className="command">
      <code className="cmd">{text}</code> <CopyButton text={text} />
    </span>
  );
}

async function errorOf(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

interface WorkbenchProps {
  exerciseId: string;
  solution: string;
  initial: WorkspaceListing;
  needsApi: boolean;
  /** Open with "Start over" suggested: a passed review is solved from memory. */
  suggestFresh: boolean;
}

/**
 * Edit your solution and grade it. Saving writes into your workspace through
 * the API; grading runs `dojo run` on the server and streams its output here.
 */
export function Workbench({ exerciseId, solution, initial, needsApi, suggestFresh }: WorkbenchProps) {
  const router = useRouter();
  const [listing, setListing] = useState(initial);
  const [selected, setSelected] = useState(initial.files[0]?.path ?? solution);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [newPath, setNewPath] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [running, setRunning] = useState<RunMode | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const logRef = useRef<HTMLPreElement>(null);

  const api = `/api/exercises/${exerciseId}`;
  const files: WorkspaceFile[] = [
    ...listing.files,
    // A new file exists only as a draft until it is saved.
    ...Object.keys(drafts)
      .filter((p) => !listing.files.some((f) => f.path === p))
      .map((p) => ({ path: p, content: "" })),
  ];
  const current = files.find((f) => f.path === selected);
  const value = drafts[selected] ?? current?.content ?? "";
  const dirty = Object.entries(drafts).filter(([p, c]) => listing.files.find((f) => f.path === p)?.content !== c);

  const reload = async () => {
    const res = await fetch(`${api}/files`, { cache: "no-store" });
    if (!res.ok) throw new Error(await errorOf(res));
    const next = (await res.json()) as WorkspaceListing;
    setListing(next);
    setDrafts({});
    if (!next.files.some((f) => f.path === selected)) setSelected(next.files[0]?.path ?? solution);
  };

  const saveAll = async (): Promise<boolean> => {
    for (const [path, content] of dirty) {
      const res = await fetch(`${api}/files`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path, content }),
      });
      if (!res.ok) {
        setError(`${path}: ${await errorOf(res)}`);
        return false;
      }
    }
    if (dirty.length > 0) await reload();
    return true;
  };

  const run = async (mode: RunMode) => {
    setError(null);
    if (mode === "fresh" && !confirm("Move your current solution aside and start over from the starter?")) return;
    if (mode === "run" && !(await saveAll())) return;
    setRunning(mode);
    setStatus(null);
    setLog([]);
    try {
      const res = await fetch(`${api}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (!res.ok || !res.body) throw new Error(await errorOf(res));
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffered = "";
      for (;;) {
        const { value: chunk, done } = await reader.read();
        if (done) break;
        buffered += chunk;
        const lines = buffered.split("\n");
        buffered = lines.pop() ?? "";
        for (const line of lines) {
          if (!line) continue;
          const event = JSON.parse(line) as RunEvent;
          if (event.type === "line") {
            setLog((l) => [...l, event.text]);
            requestAnimationFrame(() => logRef.current?.scrollTo({ top: logRef.current.scrollHeight }));
          } else {
            setStatus(event.error ? `Could not start: ${event.error}` : event.code === 0 ? "Done." : `Finished with exit code ${event.code}.`);
          }
        }
      }
      await reload();
      // The server pages show the new run, the schedule and what's next.
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(null);
    }
  };

  const busy = running !== null;
  return (
    <div className="workbench">
      {!listing.started ? (
        <div className="card hero">
          <div>Starting copies the starter files into your workspace. Then you edit them here and grade.</div>
          <button type="button" className="primary" disabled={busy} onClick={() => run("run")}>
            {running ? "Starting…" : "Start exercise"}
          </button>
        </div>
      ) : (
        <div className="card">
          <div className="file-tabs">
            {files.map((f) => (
              <button
                type="button"
                key={f.path}
                className={f.path === selected ? "tab active" : "tab"}
                onClick={() => setSelected(f.path)}
              >
                {f.path}
                {dirty.some(([p]) => p === f.path) ? " •" : ""}
                {f.path === solution ? " (solution)" : ""}
              </button>
            ))}
            <form
              className="new-file"
              onSubmit={(e) => {
                e.preventDefault();
                const p = newPath.trim().replace(/^\/+/, "");
                if (!p) return;
                setDrafts((d) => ({ ...d, [p]: d[p] ?? "" }));
                setSelected(p);
                setNewPath("");
              }}
            >
              <input value={newPath} onChange={(e) => setNewPath(e.target.value)} placeholder="new/file.md" aria-label="New file path" />
              <button type="submit">Add</button>
            </form>
          </div>
          <textarea
            className="editor"
            spellCheck={false}
            value={value}
            onChange={(e) => setDrafts((d) => ({ ...d, [selected]: e.target.value }))}
            aria-label={`Contents of ${selected}`}
          />
          {listing.skipped.length > 0 && (
            <p className="muted">Not editable here (binary, large or links): {listing.skipped.join(", ")}</p>
          )}
          <div className="actions">
            <button type="button" disabled={busy || dirty.length === 0} onClick={() => saveAll()}>
              Save{dirty.length > 0 ? ` (${dirty.length})` : ""}
            </button>
            <button type="button" className={suggestFresh ? "" : "primary"} disabled={busy || needsApi} onClick={() => run("run")}>
              {running === "run" ? "Grading…" : "Save and grade"}
            </button>
            <button type="button" className={suggestFresh ? "primary" : ""} disabled={busy} onClick={() => run("fresh")}>
              {running === "fresh" ? "Resetting…" : "Start over (--fresh)"}
            </button>
            <button type="button" disabled={busy || needsApi} onClick={() => run("calibrate")}>
              {running === "calibrate" ? "Calibrating…" : "Calibrate the judge"}
            </button>
          </div>
          {needsApi && <p className="muted">Grading this exercise needs API credits (DOJO_BACKEND=api).</p>}
        </div>
      )}
      {error && <p className="error">{error}</p>}
      {(log.length > 0 || busy) && (
        <>
          <h3 className="log-title">
            Output {busy && <span className="muted">running… a graded run can take a minute or more</span>}
          </h3>
          <pre className="log" ref={logRef}>
            {log.join("\n")}
          </pre>
          {status && <p className="muted">{status}</p>}
        </>
      )}
    </div>
  );
}
