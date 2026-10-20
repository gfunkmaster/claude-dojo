---
id: agents-first-subagent
title: Din första subagent
skill: agents
type: env
difficulty: 1
solution: .claude/agents/test-writer.md
env:
  fixture: [../../_shared/tool-log, fixture]
  maxTurns: 20
  maxCostUsd: 1
  allowedTools: [Read, Edit, Write, Glob, Grep, Agent, Task, "Bash(npm test)", "Bash(npm test:*)"]
cases:
  - name: tester via subagent
    task: Låt subagenten test-writer skriva tester för src/math.js. Testerna ska gå igenom.
    checks:
      - { kind: file-exists, path: test/math.test.js }
      - { kind: command, run: npm test --silent }
      - { kind: file-contains, path: .dojo/tools.log, pattern: "(Agent|Task)\\t.*test-writer" }
criteria:
  - id: frontmatter
    weight: 2
    text: Filen har giltig frontmatter med `name`, en `description` som säger när agenten ska användas, och en avgränsad lista `tools`.
  - id: clear-job
    weight: 2
    text: Instruktionen säger exakt vad agenten ska leverera (testfilens plats, testramverk, att köra testerna) och vad den ska rapportera tillbaka.
  - id: least-privilege
    weight: 1
    text: Agenten får bara de verktyg den behöver.
references:
  - { label: good, dir: refs/good, expect: [75, 100] }
  - { label: bad, dir: refs/bad, expect: [0, 60] }
---

En subagent är en egen Claude med eget kontextfönster, egen instruktion och egna verktyg. Huvudagenten delegerar till den.

Skriv `.claude/agents/test-writer.md`: en subagent som skriver tester med Nodes inbyggda testramverk (`node:test`) i `test/<namn>.test.js` och kör `npm test` innan den rapporterar tillbaka.

Dojo ber `claude -p` använda din agent och kontrollerar i verktygsloggen att den faktiskt anropades.
Kräver att `claude` är installerat och inloggat.
