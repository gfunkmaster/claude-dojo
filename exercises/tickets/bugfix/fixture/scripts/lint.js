import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const problems = [];

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

for (const file of walk("src")) {
  const text = readFileSync(file, "utf8");
  if (/console\.log/.test(text)) problems.push(`${file}: console.log is not allowed in src/`);
  if (/throw new Error\(/.test(text)) problems.push(`${file}: throw a class from src/common/errors.js, not Error`);
  if (file.endsWith(".service.js") && /new Date\(\)/.test(text)) problems.push(`${file}: use the injected clock, not new Date()`);
}

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("lint ok");
