// Dojo's own PostToolUse hook: one line per tool call, so checks can see what Claude did.
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

try {
  const input = JSON.parse(readFileSync(0, "utf8"));
  const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  mkdirSync(path.join(root, ".dojo"), { recursive: true });
  appendFileSync(path.join(root, ".dojo", "tools.log"), `${input.tool_name}\t${JSON.stringify(input.tool_input ?? {})}\n`);
} catch {
  // Never get in Claude's way.
}
