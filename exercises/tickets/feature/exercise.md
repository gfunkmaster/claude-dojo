---
id: ticket-feature
title: "Ärende: en ny feature, från plan till klart"
skill: context
type: env
difficulty: 2
playbook: feature
solution: .claude/commands/feature.md
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
    - Bash(git status:*)
    - Bash(git diff:*)
cases:
  - name: /feature DOJO-142
    task: /feature tickets/DOJO-142.md
    checks:
      - { kind: file-exists, path: PLAN.md }
      - { kind: file-contains, path: PLAN.md, pattern: "[Kk]lart när|[Dd]efinition of [Dd]one|DoD" }
      # The first file Claude writes or edits is the plan, before any code.
      - { kind: file-contains, path: .dojo/tools.log, pattern: "^(?:(?!(?:Write|Edit|MultiEdit)\\t)[^\\n]*\\n)*Write\\t[^\\n]*PLAN\\.md" }
      - kind: command
        run: |
          node --input-type=module -e '
          import assert from "node:assert/strict";
          import { OrderStateError, ValidationError } from "./src/common/errors.js";
          import { OrdersService } from "./src/orders/orders.service.js";
          const at = new Date("2026-10-21T10:00:00Z");
          const orders = new OrdersService(() => at);
          const items = [{ sku: "mug", qty: 1 }];
          const a = orders.create({ customerId: "c1", items });
          assert.throws(() => orders.cancel(a.id, "  x  "), ValidationError);
          const cancelled = orders.cancel(a.id, "Kunden ångrade sig");
          assert.equal(cancelled.status, "cancelled");
          assert.equal(cancelled.cancelReason, "Kunden ångrade sig");
          assert.equal(+cancelled.cancelledAt, +at);
          assert.throws(() => orders.cancel(a.id, "igen"), OrderStateError);
          const b = orders.create({ customerId: "c2", items });
          orders.markPaid(b.id);
          assert.equal(orders.cancel(b.id, "Fel storlek").status, "cancelled");
          const c = orders.create({ customerId: "c3", items });
          orders.markPaid(c.id);
          orders.markShipped(c.id);
          assert.throws(() => orders.cancel(c.id, "För sent"), OrderStateError);
          '
      - kind: command
        run: |
          node --input-type=module -e '
          import assert from "node:assert/strict";
          import { createApp } from "./src/app.js";
          const app = createApp();
          const created = await app.handle({ method: "POST", url: "/orders", body: { customerId: "c1", items: [{ sku: "mug", qty: 1 }] } });
          const res = await app.handle({ method: "POST", url: `/orders/${created.body.id}/cancel`, body: { reason: "Kunden ångrade sig" } });
          assert.equal(res.status, 200);
          assert.equal(res.body.status, "cancelled");
          assert.equal((await app.handle({ method: "POST", url: "/orders/999/cancel", body: { reason: "Finns inte" } })).status, 404);
          assert.equal((await app.handle({ method: "POST", url: `/orders/${created.body.id}/cancel`, body: { reason: "Igen" } })).status, 409);
          '
      - { kind: command, run: "grep -rqs cancel test/" }
      - { kind: command, run: npm test --silent }
      - { kind: command, run: npm run lint --silent }
criteria:
  - id: context-first
    weight: 2
    text: Kommandot låter Claude läsa ärendet och repots egna regler (AGENTS.md, närliggande kod och tester) innan något ändras, i stället för att gissa konventionerna.
  - id: plan-first
    weight: 2
    text: Kommandot kräver en plan i PLAN.md innan koden ändras (vilka filer, i vilken ordning, öppna frågor), och säger vad Claude ska göra om ärendet är oklart eller motsägelsefullt.
  - id: definition-of-done
    weight: 2
    text: Kommandot gör ett explicit klart-kriterium av ärendets acceptanskriterier (ett test per kriterium, `npm test` och `npm run lint` gröna) och kräver att det bockas av innan Claude säger att den är klar.
  - id: delegation
    weight: 1
    text: Kommandot säger när en subagent ska användas (till exempel för att kartlägga en okänd del av koden eller köra oberoende deluppgifter) och när den inte behövs.
  - id: report
    weight: 1
    text: Kommandot avslutar med en kort rapport till människan, med vad som ändrades, hur det verifierades och vad som återstår eller är utanför scope.
references:
  - { label: good, dir: refs/good, expect: [75, 100] }
  - { label: bad, dir: refs/bad, expect: [0, 55] }
---

Du har fått ett Jira-ärende om en ny feature. Den vanliga fällan är att klistra in ärendet och skriva "fixa det": Claude gissar repots konventioner, börjar koda direkt och säger "klart" när det kompilerar.

Gör din rutin för feature-ärenden till ett slash-kommando, `.claude/commands/feature.md`, som tar ärendet som argument (`$ARGUMENTS`). När någon kör `/feature tickets/DOJO-142.md` ska Claude:

1. läsa ärendet och repots regler (`AGENTS.md`) och den kod som berörs
2. skriva en plan i `PLAN.md` innan någon kod ändras, med ett avsnitt **Klart när** som bygger på acceptanskriterierna
3. implementera enligt planen, med tester
4. bocka av klart-kriteriet (`npm test` och `npm run lint` gröna) och rapportera

Dojo kör `claude -p "/feature tickets/DOJO-142.md"` i en kopia av ett litet orders-API (Node, uppbyggt som en NestJS-app) och kontrollerar att planen skrevs först, att acceptanskriterierna är uppfyllda och att test och lint går igenom. Domaren bedömer ditt kommando.

Rutinen och en mall att utgå från: `dojo playbook feature`. Kräver att `claude` är installerat och inloggat.
