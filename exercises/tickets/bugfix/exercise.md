---
id: ticket-bugfix
title: "Ärende: en bugg, grundorsak före fix"
skill: evals
type: env
difficulty: 2
playbook: bugfix
solution: .claude/commands/bugfix.md
env:
  fixture: [../../_shared/tool-log, fixture]
  maxTurns: 40
  maxCostUsd: 3
  allowedTools:
    - Read
    - Edit
    - Write
    - Glob
    - Grep
    - Agent
    - Task
    - TodoWrite
    - Bash(npm test)
    - Bash(npm test:*)
    - Bash(npm run lint)
    - Bash(npm run lint:*)
    - Bash(node --test:*)
    - Bash(git status:*)
    - Bash(git diff:*)
cases:
  - name: /bugfix DOJO-217
    task: /bugfix tickets/DOJO-217.md
    checks:
      - { kind: file-contains, path: BUGFIX.md, pattern: "reports\\.service\\.js" }
      # A failing test and the root cause are written before the code under src/ is touched.
      - { kind: file-contains, path: .dojo/tools.log, pattern: "^(?:(?!(?:Write|Edit|MultiEdit)\\t[^\\n]*\"file_path\":\"(?:[^\"]*/)?src/)[^\\n]*\\n)*(?:Write|Edit|MultiEdit)\\t[^\\n]*\"file_path\":\"(?:[^\"]*/)?test/" }
      - { kind: file-contains, path: .dojo/tools.log, pattern: "^(?:(?!(?:Write|Edit|MultiEdit)\\t[^\\n]*\"file_path\":\"(?:[^\"]*/)?src/)[^\\n]*\\n)*(?:Write|Edit|MultiEdit)\\t[^\\n]*BUGFIX\\.md" }
      - kind: command
        run: |
          node --input-type=module -e '
          import assert from "node:assert/strict";
          import { ReportsService } from "./src/reports/reports.service.js";
          const order = (iso) => ({ createdAt: new Date(iso), totalOre: 100 });
          const reports = new ReportsService({ list: () => [order("2026-10-01T10:00:00Z"), order("2026-10-07T00:00:00Z"), order("2026-10-07T23:59:59Z"), order("2026-10-08T00:00:00Z")] });
          const rows = reports.ordersPerDay("2026-10-01", "2026-10-07");
          assert.equal(rows.length, 7);
          assert.deepEqual(rows.at(-1), { date: "2026-10-07", count: 2 });
          assert.deepEqual(rows[0], { date: "2026-10-01", count: 1 });
          assert.deepEqual(reports.ordersPerDay("2026-10-07", "2026-10-07"), [{ date: "2026-10-07", count: 2 }]);
          '
      # The regression test fails on the code from before the fix.
      - kind: command
        run: |
          d=$(mktemp -d) && cp -R . "$d" && cd "$d" && git checkout -q HEAD -- src
          npm test --silent >/dev/null 2>&1; status=$?
          cd / && rm -rf "$d"
          [ "$status" -ne 0 ]
      # The existing tests are still there.
      - { kind: command, run: "for t in 'counts orders per day' 'ignores orders outside' 'rejects bad dates'; do grep -rqF \"$t\" test/ || exit 1; done" }
      - { kind: command, run: npm test --silent }
      - { kind: command, run: npm run lint --silent }
criteria:
  - id: reproduce-first
    weight: 2
    text: Kommandot låter Claude återskapa felet först, med ett test som visar felet (rött) innan någon kod ändras.
  - id: root-cause
    weight: 2
    text: Kommandot kräver en verifierad grundorsak med fil och rad innan fixen, och säger att rapportörens gissningar (som "kanske cachen") ska prövas mot koden i stället för att tas för givna.
  - id: regression-test
    weight: 2
    text: Kommandot kräver ett regressionstest som failar utan fixen och går igenom med den, och förbjuder att befintliga tester tas bort eller försvagas för att få grönt.
  - id: minimal-fix
    weight: 1
    text: Kommandot ber om den minsta ändring som rättar grundorsaken, utan orelaterade refaktoreringar, och att leta efter samma fel på andra ställen.
  - id: report
    weight: 1
    text: Kommandot avslutar med en rapport om orsak, fix och hur det verifierades, i BUGFIX.md och i svaret.
references:
  - { label: good, dir: refs/good, expect: [75, 100] }
  - { label: bad, dir: refs/bad, expect: [0, 55] }
---

Du har fått ett buggärende. Klistrar du bara in det och ber Claude "fixa buggen" får du ofta en ändring som får symptomet att försvinna, utan att någon vet varför, och utan ett test som hindrar att buggen kommer tillbaka.

Gör din rutin för buggärenden till ett slash-kommando, `.claude/commands/bugfix.md`, som tar ärendet som argument (`$ARGUMENTS`). När någon kör `/bugfix tickets/DOJO-217.md` ska Claude:

1. läsa ärendet och återskapa felet med ett test som failar, innan någon kod under `src/` ändras
2. hitta grundorsaken (fil och rad) och skriva den i `BUGFIX.md`, också innan fixen
3. göra den minsta fix som rättar grundorsaken
4. visa att regressionstestet nu går igenom, att inget annat gick sönder, och rapportera

Dojo kör `claude -p "/bugfix tickets/DOJO-217.md"` i en kopia av ett litet rapport-API och kontrollerar att buggen är rättad, att det nya testet failar mot den gamla koden, att test och orsak skrevs före fixen, och att `BUGFIX.md` pekar ut rätt fil. Domaren bedömer ditt kommando.

Rutinen och en mall att utgå från: `dojo playbook bugfix`. Kräver att `claude` är installerat och inloggat.
