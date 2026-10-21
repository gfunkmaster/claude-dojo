---
id: context-agents-md
title: AGENTS.md som får Claude att följa repots regler
skill: context
type: env
difficulty: 2
solution: AGENTS.md
env:
  fixture: fixture
  maxTurns: 20
  maxCostUsd: 1
  allowedTools:
    - Read
    - Edit
    - Write
    - Glob
    - Grep
    - Bash(npm test)
    - Bash(npm test:*)
    - Bash(npm run lint)
    - Bash(npm run lint:*)
    - Bash(ls:*)
cases:
  - name: ny endpoint
    task: Lägg till en endpoint GET /health som svarar med JSON {"status":"ok"}.
    checks:
      - { kind: file-exists, path: src/routes/health.js }
      - { kind: file-exists, path: test/routes/health.test.js }
      - { kind: file-contains, path: src/routes/index.js, pattern: "health" }
      - { kind: file-contains, path: CHANGELOG.md, pattern: "# Changelog\\s+## Unreleased\\s+- Add GET /health\\n" }
      - { kind: command, run: npm test --silent }
      - { kind: command, run: npm run lint --silent }
      - { kind: max-turns, value: 15 }
criteria:
  - id: commands
    weight: 2
    text: AGENTS.md anger de exakta kommandona för test och lint och när de ska köras.
  - id: non-obvious-rules
    weight: 2
    text: AGENTS.md beskriver repots regler som inte syns direkt i koden, till exempel registrering i src/routes/index.js, testernas plats, lint-reglerna och raden i CHANGELOG.md.
  - id: no-noise
    weight: 1
    text: AGENTS.md är kort. Den upprepar inte sådant som koden redan visar och innehåller inga allmänna råd som "skriv ren kod".
  - id: efficient-run
    weight: 1
    text: Claude löste uppgiften utan onödiga omvägar, sett till antal turer och ändrade filer.
references:
  - { label: good, dir: refs/good, expect: [70, 100] }
  - { label: bad, dir: refs/bad, expect: [0, 60] }
---

Repot i den här övningen är en liten HTTP-tjänst i ren Node med egna regler:

- Varje route är en fil i `src/routes/` som exporterar `{ method, path, handler }`.
- Varje route måste registreras i `src/routes/index.js`.
- Varje route måste ha ett test i `test/routes/<namn>.test.js`.
- `npm run lint` underkänner `console.log` i `src/`, filnamn som inte är kebab-case och routes utan test.
- Varje ny route får en rad `- Add <METOD> <sökväg>` under `## Unreleased` överst i `CHANGELOG.md`. Rubriken skapas om den saknas. Ingen kontroll i repot fångar det, så bara din AGENTS.md kan lära Claude regeln.

Skriv en `AGENTS.md` som gör att Claude Code följer reglerna direkt, utan att behöva leta.
Dojo kopierar repot och din fil till en sandlåda, ber `claude -p` lägga till en endpoint och kontrollerar sedan att test och lint går igenom.

Kort och konkret slår långt och allmänt. Den här övningen kräver att `claude` är installerat och inloggat.
