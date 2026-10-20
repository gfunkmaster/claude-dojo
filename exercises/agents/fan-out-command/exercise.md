---
id: agents-fan-out-command
title: Ett kommando som delar ut jobb till parallella subagenter
skill: agents
type: env
difficulty: 2
solution: .claude/commands/audit.md
env:
  fixture: [../../_shared/tool-log, fixture]
  maxTurns: 25
  maxCostUsd: 2
  allowedTools: [Read, Glob, Grep, Write, Agent, Task]
cases:
  - name: /audit
    task: /audit
    checks:
      - { kind: file-contains, path: AUDIT.md, pattern: "## api" }
      - { kind: file-contains, path: AUDIT.md, pattern: "## web" }
      - { kind: file-contains, path: AUDIT.md, pattern: "## worker" }
      - { kind: file-contains, path: AUDIT.md, pattern: "eval" }
      - { kind: file-contains, path: AUDIT.md, pattern: "http://" }
      - { kind: file-contains, path: .dojo/tools.log, pattern: "((Agent|Task)\\t[^\\n]*\\n[\\s\\S]*){3}" }
criteria:
  - id: one-agent-per-package
    weight: 2
    text: Kommandot delar ut ett paket per subagent och säger att de ska startas parallellt i samma tur.
  - id: subagent-brief
    weight: 2
    text: Varje subagent får en fristående instruktion med paketets sökväg, vad den ska leta efter och exakt vilket format den ska rapportera i.
  - id: merge-step
    weight: 1
    text: Kommandot säger hur huvudagenten slår ihop svaren till AUDIT.md, med en sektion per paket.
references:
  - { label: good, dir: refs/good, expect: [75, 100] }
  - { label: bad, dir: refs/bad, expect: [0, 60] }
---

Stora granskningar går snabbare och håller kontexten ren om varje del får en egen subagent.

Skriv ett eget slash-kommando i `.claude/commands/audit.md`. När någon kör `/audit` ska Claude:

1. hitta varje paket under `packages/`
2. starta en subagent per paket, parallellt, som letar efter säkerhetsproblem
3. skriva `AUDIT.md` med en sektion `## <paketnamn>` per paket och fynden i den

Dojo kör `claude -p "/audit"` och kontrollerar rapporten och att minst tre subagenter startades.
Kräver att `claude` är installerat och inloggat.
