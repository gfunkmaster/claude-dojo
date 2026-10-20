import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

let input = {};
try {
  input = JSON.parse(readFileSync(0, "utf8"));
} catch {
  // No input: treat as a first stop.
}

// Already sent back once: let Claude stop so we never loop forever.
if (input.stop_hook_active) process.exit(0);

const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const run = spawnSync("npm", ["test", "--silent"], { cwd: root, encoding: "utf8", timeout: 100_000 });
if (run.status === 0) process.exit(0);

const output = `${run.stdout}${run.stderr}`.split("\n").slice(-40).join("\n");
process.stderr.write(`npm test is failing. Fix the code (not the tests) before you finish.\n\n${output}\n`);
process.exit(2);
