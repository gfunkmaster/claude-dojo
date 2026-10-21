import type { Metadata } from "next";
import type { ReactNode } from "react";
import { resolveBackend } from "../../src/llm/backend.ts";
import "./globals.css";

export const metadata: Metadata = { title: "Claude Dojo", description: "Your Claude Dojo progress" };

function backendLabel(): string {
  try {
    return resolveBackend() === "api" ? "backend: api (API credits)" : "backend: claude-cli (subscription)";
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site">
          <nav>
            <a className="brand" href="/">Claude Dojo</a>
            <a href="/">Overview</a>
            <a href="/exercises">Exercises</a>
            <span className="backend">{backendLabel()}</span>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
