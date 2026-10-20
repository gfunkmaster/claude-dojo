import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

let input = {};
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0);
}
const command = typeof input.tool_input?.command === "string" ? input.tool_input.command : "";

// Split on shell separators so `cd x && rm -rf y` is caught too.
const segments = command.split(/&&|\|\||;|\|/);
const recursive = segments.some((segment) => {
  const words = segment.trim().split(/\s+/);
  const rm = words.findIndex((w) => w === "rm" || w.endsWith("/rm"));
  if (rm === -1) return false;
  return words.slice(rm + 1).some((w) => w === "--recursive" || /^-[a-zA-Z]*[rR][a-zA-Z]*$/.test(w));
});

if (!recursive) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
mkdirSync(path.join(root, ".dojo"), { recursive: true });
appendFileSync(path.join(root, ".dojo", "blocked.log"), `${new Date().toISOString()} ${command}\n`);
process.stderr.write("Blocked: recursive rm is not allowed in this repo. Delete single files instead, or ask the user.\n");
process.exit(2);
