---
id: context-project-commands
title: Lär Claude repots kommandon
skill: context
type: env
difficulty: 1
solution: AGENTS.md
env:
  fixture: [../../_shared/tool-log, fixture]
  maxTurns: 12
  maxCostUsd: 0.5
  allowedTools: [Read, Edit, Write, Glob, Grep, "Bash(npm test)", "Bash(npm test:*)", "Bash(npm run check)", "Bash(npm run check:*)"]
cases:
  - name: fixa en bugg
    task: Fixa buggen i slugify så att testerna går igenom.
    checks:
      - { kind: command, run: npm run check --silent }
      - { kind: file-contains, path: .dojo/tools.log, pattern: "npm run check" }
      - { kind: file-contains, path: .dojo/tools.log, pattern: "npm test", negate: true }
      - { kind: max-turns, value: 8 }
criteria:
  - id: exact-commands
    weight: 2
    text: AGENTS.md anger det exakta testkommandot och säger uttryckligen att `npm test` inte ska användas.
  - id: when-to-run
    weight: 1
    text: AGENTS.md säger när kommandot ska köras, till exempel efter varje ändring.
  - id: short
    weight: 1
    text: Filen är några rader lång och innehåller bara det Claude inte kan se direkt i koden.
references:
  - { label: good, dir: refs/good, expect: [75, 100] }
  - { label: bad, dir: refs/bad, expect: [0, 60] }
---

Första steget mot bra kontext: tala om för Claude hur repot körs.

I det här repot är `npm test` avvecklat och misslyckas med flit. Testerna körs med `npm run check`.
Skriv en `AGENTS.md` så att Claude kör rätt kommando direkt, utan att först prova fel.

Dojo ber `claude -p` fixa en bugg och loggar varje verktygsanrop. Du får full poäng om Claude aldrig kör `npm test`, om testerna går igenom och om det går på få turer.
Kräver att `claude` är installerat och inloggat.
