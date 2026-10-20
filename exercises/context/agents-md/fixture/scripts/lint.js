import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const problems = [];
const kebab = /^[a-z0-9]+(-[a-z0-9]+)*(\.test)?\.js$/;

function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

for (const file of [...walk("src"), ...walk("test")]) {
  if (!kebab.test(path.basename(file))) problems.push(`${file}: file name must be kebab-case`);
  if (file.startsWith("src") && /console\.log/.test(readFileSync(file, "utf8"))) {
    problems.push(`${file}: console.log is not allowed in src/`);
  }
}

for (const name of readdirSync("src/routes")) {
  if (name === "index.js") continue;
  const testFile = path.join("test/routes", name.replace(/\.js$/, ".test.js"));
  if (!existsSync(testFile)) problems.push(`src/routes/${name}: missing ${testFile}`);
  const index = readFileSync("src/routes/index.js", "utf8");
  if (!index.includes(`./${name}`)) problems.push(`src/routes/${name}: not registered in src/routes/index.js`);
}

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("lint ok");
