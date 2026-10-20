import { appendFileSync, mkdirSync, readFileSync } from "node:fs";

const input = JSON.parse(readFileSync(0, "utf8"));
if (input.tool_input.command.includes("rm")) {
  mkdirSync(".dojo", { recursive: true });
  appendFileSync(".dojo/blocked.log", input.tool_input.command + "\n");
  process.exit(1);
}
