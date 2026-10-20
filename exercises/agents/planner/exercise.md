---
id: agents-planner
title: En orkestrerare som planerar för flera agenter
skill: agents
type: prompt
difficulty: 3
model: claude-sonnet-5-5
solution: system.md
cases:
  - name: ny funktion
    text: Lägg till inloggning med passkeys i vår Next.js-app. Vi använder Prisma och Postgres.
    checks:
      - { kind: json-valid }
      - { kind: json-path, path: "$.tasks[0].dependsOn", equals: [] }
      - { kind: regex, pattern: "\"agent\":\\s*\"researcher\"" }
      - { kind: regex, pattern: "\"agent\":\\s*\"reviewer\"" }
      - { kind: regex, pattern: "\"agent\":\\s*\"(?!researcher|coder|reviewer)", negate: true }
  - name: buggjakt
    text: Kunder får ibland dubbla mejl vid beställning. Hitta orsaken och fixa det.
    checks:
      - { kind: json-valid }
      - { kind: json-path, path: "$.tasks[0].dependsOn", equals: [] }
      - { kind: regex, pattern: "\"agent\":\\s*\"coder\"" }
      - { kind: regex, pattern: "\"agent\":\\s*\"(?!researcher|coder|reviewer)", negate: true }
  - name: för vag
    text: Gör appen bättre.
    checks:
      - { kind: json-valid }
      - { kind: json-path, path: $.tasks, equals: [] }
      - { kind: regex, pattern: "\"question\":\\s*\"" }
criteria:
  - id: self-contained-briefs
    weight: 2
    text: Prompten kräver att varje uppgift har ett fristående `goal` som en agent utan annan kontext kan agera på, med ett tydligt klart-kriterium.
  - id: dependencies
    weight: 2
    text: Prompten förklarar hur `dependsOn` används, så att oberoende uppgifter kan köras parallellt och granskning kommer sist.
  - id: clarify
    weight: 1
    text: "Prompten säger vad som ska hända när uppdraget är för vagt: en fråga i stället för en gissad plan."
  - id: right-size
    weight: 1
    text: Prompten håller planen liten (få uppgifter) och förbjuder uppgifter som bara delar upp arbete utan att leverera något.
references:
  - { label: good, dir: refs/good, expect: [75, 100] }
  - { label: bad, dir: refs/bad, expect: [0, 55] }
---

En orkestrerare tar emot ett uppdrag och delar upp det mellan tre sorters agenter: `researcher` (läser kod och dokumentation), `coder` (ändrar kod) och `reviewer` (granskar ändringar).

Skriv `system.md` så att modellen alltid svarar med exakt ett JSON-objekt:

```json
{
  "question": null,
  "tasks": [
    { "id": "t1", "agent": "researcher", "goal": "...", "dependsOn": [] }
  ]
}
```

- Första uppgiften har inga beroenden. Uppgifter som kan köras samtidigt ska inte bero på varandra.
- Om uppdraget är för vagt ska `tasks` vara tom och `question` innehålla en konkret motfråga.
