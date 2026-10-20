---
description: Security audit of every package, one parallel subagent per package
allowed-tools: Glob, Read, Grep, Write, Agent, Task
---

Run a security audit of this repository.

1. List the directories directly under `packages/`. Each one is a package.
2. Start one subagent per package, all in the same turn so they run in parallel. Give each one this brief, with the path filled in:
   "Audit `packages/<name>/` for security problems: hardcoded secrets, use of eval or Function, plain http:// URLs, and unvalidated input. Read every file in that folder only. Reply with a markdown list, one bullet per finding: `file:line: problem (severity high/medium/low)`. Reply `- no findings` if there are none."
3. When every subagent has answered, write `AUDIT.md` with one section per package, `## <name>`, containing that subagent's list unchanged. Order the sections alphabetically.
