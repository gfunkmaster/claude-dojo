---
id: ticket-research
title: "Ärende: en research-spike med källor och slutsats"
skill: agents
type: env
difficulty: 3
playbook: research
solution: .claude/commands/research.md
env:
  fixture: [../../_shared/tool-log, fixture]
  maxTurns: 40
  maxCostUsd: 3
  allowedTools: [Read, Glob, Grep, Write, Agent, Task, TodoWrite]
cases:
  - name: /research DOJO-305
    task: /research tickets/DOJO-305.md
    checks:
      - { kind: file-contains, path: RESEARCH.md, pattern: "## Fråga[\\s\\S]*## Fynd[\\s\\S]*## Slutsats" }
      - { kind: file-contains, path: RESEARCH.md, pattern: "\\|\\s*`?checkout`?\\s*\\|\\s*\\**([Jj]a|[Dd]elvis)" }
      - { kind: file-contains, path: RESEARCH.md, pattern: "\\|\\s*`?billing`?\\s*\\|\\s*\\**[Nn]ej" }
      - { kind: file-contains, path: RESEARCH.md, pattern: "\\|\\s*`?notifications`?\\s*\\|\\s*\\**([Nn]ej|[Dd]elvis)" }
      - { kind: file-contains, path: RESEARCH.md, pattern: "billing/src/webhooks\\.js:\\d+" }
      - { kind: file-contains, path: RESEARCH.md, pattern: "notifications/src/webhooks\\.js:\\d+" }
      # The ADR says every service is idempotent; the code says otherwise.
      - { kind: file-contains, path: RESEARCH.md, pattern: "ADR|0007" }
      - { kind: command, run: "test -z \"$(git status --porcelain -- services docs prisma tickets AGENTS.md)\"" }
      - { kind: file-contains, path: .dojo/tools.log, pattern: "((Agent|Task)\\t[^\\n]*\\n[\\s\\S]*){2}" }
criteria:
  - id: bounded-question
    weight: 2
    text: Kommandot gör om ärendet till en avgränsad fråga innan sökningen börjar (vad som ingår och inte, vad som räknas som svar, timeboxen) och säger vad Claude ska göra om frågan inte går att avgränsa.
  - id: breadth-with-subagents
    weight: 2
    text: Kommandot delar ut bredden till subagenter, en per tjänst eller område, parallellt, med en fristående instruktion och ett fast svarsformat med fil:rad, så att huvudagentens kontext hålls liten.
  - id: sources-vs-conclusions
    weight: 2
    text: Kommandot håller isär fynd med källa (fil:rad, dokument) och slutsatser eller rekommendationer, och kräver att kod väger tyngre än dokumentation när de säger emot varandra.
  - id: uncertainty
    weight: 1
    text: Kommandot kräver att osäkerheter och det som inte undersöktes redovisas, i stället för att allt låter säkert.
  - id: read-only
    weight: 1
    text: Kommandot säger uttryckligen att ingen kod ändras i en spike, och begränsar sig till verktyg som läser plus att skriva rapporten.
references:
  - { label: good, dir: refs/good, expect: [75, 100] }
  - { label: bad, dir: refs/bad, expect: [0, 55] }
---

Du har fått en spike: en fråga att utreda, inte kod att skriva. Ber du Claude "kolla upp det här" läser den hela repot in i en enda kontext, blandar ihop vad koden faktiskt gör med vad den tror, och skriver en slutsats som låter säkrare än den är.

Gör din rutin för research-ärenden till ett slash-kommando, `.claude/commands/research.md`, som tar ärendet som argument (`$ARGUMENTS`). När någon kör `/research tickets/DOJO-305.md` ska Claude:

1. avgränsa frågan: vad som ska besvaras, vad som inte ingår
2. låta subagenter undersöka bredden parallellt (till exempel en per tjänst) och svara med fynd och källor
3. skriva `RESEARCH.md` med de här rubrikerna, i den här ordningen:
   - `## Fråga`: den avgränsade frågan
   - `## Fynd`: en tabell `| Tjänst | Idempotent | Källa |` med en rad per berörd tjänst, `ja`, `nej` eller `delvis`, och källan som `fil:rad`
   - `## Slutsats`: tolkning och rekommendation, skild från fynden
   - `## Osäkerheter`: det som inte är klarlagt
4. inte ändra någon kod

Dojo kör `claude -p "/research tickets/DOJO-305.md"` i en kopia av ett litet monorepo med flera tjänster och kontrollerar rapportens rubriker, att varje tjänst bedöms rätt med källa, att den motsägelsefulla dokumentationen uppmärksammas, att inget ändrades och att subagenter användes. Domaren bedömer ditt kommando.

Rutinen och en mall att utgå från: `dojo playbook research`. Kräver att `claude` är installerat och inloggat.
