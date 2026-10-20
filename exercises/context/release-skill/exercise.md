---
id: context-release-skill
title: En skill som Claude hittar själv
skill: context
type: env
difficulty: 3
solution: .claude/skills/release-notes/SKILL.md
env:
  fixture: [../../_shared/tool-log, fixture]
  maxTurns: 15
  maxCostUsd: 1
  allowedTools: [Read, Glob, Grep, Write, Edit, Skill]
cases:
  - name: release notes
    task: Skriv release notes för version 2.4.0 utifrån changes.txt.
    checks:
      - { kind: file-contains, path: .dojo/tools.log, pattern: "Skill\\t" }
      - { kind: file-contains, path: RELEASE_NOTES.md, pattern: "^# 2\\.4\\.0" }
      - { kind: file-contains, path: RELEASE_NOTES.md, pattern: "## Nyheter" }
      - { kind: file-contains, path: RELEASE_NOTES.md, pattern: "## Fixar" }
      - { kind: file-contains, path: RELEASE_NOTES.md, pattern: "\\(#412\\)" }
      - { kind: file-contains, path: RELEASE_NOTES.md, pattern: "chore|ci:|bump", negate: true }
criteria:
  - id: discoverable
    weight: 2
    text: Frontmatterns `description` säger både vad skillen gör och när den ska användas, med de ord en användare skulle skriva.
  - id: exact-format
    weight: 2
    text: Skillen anger exakt format med en mall, och regler för vilka ändringar som tas med och vilka som hoppas över.
  - id: progressive
    weight: 1
    text: SKILL.md är kort. Det som bara behövs ibland ligger i separata filer som skillen hänvisar till.
references:
  - { label: good, dir: refs/good, expect: [75, 100] }
  - { label: bad, dir: refs/bad, expect: [0, 60] }
---

En skill är en mapp med `SKILL.md` som Claude laddar själv när uppgiften passar. Bara namnet och beskrivningen ligger i kontexten tills skillen behövs.

Skriv `.claude/skills/release-notes/SKILL.md` så att Claude använder den för release notes utan att få höra det. Formatet ska vara:

```markdown
# <version>

## Nyheter
- <beskrivning> (#<pr>)

## Fixar
- <beskrivning> (#<pr>)
```

Ändringar av typen `chore`, `ci` och versionsbumpar ska aldrig med. Uppgiften nämner inte skillen, så beskrivningen måste räcka för att Claude ska hitta den.
Kräver att `claude` är installerat och inloggat.
