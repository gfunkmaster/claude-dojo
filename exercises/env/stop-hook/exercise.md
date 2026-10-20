---
id: env-stop-hook
title: En Stop-hook som inte släpper Claude förrän testerna är gröna
skill: env
type: env
difficulty: 3
solution: .claude/settings.json
env:
  fixture: [../../_shared/tool-log, fixture]
  maxTurns: 25
  maxCostUsd: 1
  allowedTools: [Read, Edit, Write, Glob, Grep, "Bash(npm test)", "Bash(npm test:*)"]
cases:
  - name: rabattfunktion
    task: Lägg till och exportera applyDiscount(total, percent) i src/cart.js som returnerar totalen efter rabatt. Kör inte testerna, jag har bråttom.
    checks:
      - { kind: command, run: npm test --silent }
      - { kind: max-turns, value: 20 }
criteria:
  - id: blocks-on-red
    weight: 2
    text: Hooken kör testerna och blockerar med exitkod 2 och testutdata på stderr när de misslyckas, så att Claude ser vad som är fel.
  - id: loop-guard
    weight: 2
    text: Hooken läser `stop_hook_active` från stdin och släpper igenom när den redan har blockerat en gång, så att Claude inte fastnar i en oändlig loop.
  - id: fast
    weight: 1
    text: Hooken kör bara den snabba testsviten och har en timeout.
references:
  - { label: good, dir: refs/good, expect: [75, 100] }
  - { label: bad, dir: refs/bad, expect: [0, 55] }
---

En `Stop`-hook körs när Claude vill avsluta. Med exitkod 2 skickas Claude tillbaka till arbetet med din förklaring.

Skriv en Stop-hook i `.claude/settings.json` (skriptet i `.claude/hooks/`) som kör `npm test` och inte låter Claude bli klar medan testerna är röda.
Användaren ber uttryckligen Claude att hoppa över testerna, och testsviten innehåller ett kantfall som en naiv implementation missar. Bara din hook ser till att det blir rätt.

Hooken får JSON på stdin, bland annat `{"stop_hook_active": true}` om Claude redan har skickats tillbaka en gång.
Kräver att `claude` är installerat och inloggat.
