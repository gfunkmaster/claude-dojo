---
id: api-prompt-caching
title: Prompt caching som faktiskt träffar
skill: api
type: request
difficulty: 2
solution: request.json
cases:
  - name: första frågan
    text: Hur många semesterdagar har jag?
    checks:
      - { kind: regex, pattern: "30" }
  - name: andra frågan
    text: Hur stort är friskvårdsbidraget?
    checks:
      - { kind: regex, pattern: "5 ?000" }
      - { kind: min-cache-read, tokens: 1000 }
  - name: tredje frågan
    text: Vilken dag är kontorsdag?
    checks:
      - { kind: regex, pattern: "[Tt]isdag" }
      - { kind: min-cache-read, tokens: 1000 }
  - name: fjärde frågan
    text: Hur lång är uppsägningstiden?
    checks:
      - { kind: regex, pattern: "tre månader|3 månader" }
      - { kind: min-cache-read, tokens: 1000 }
criteria:
  - id: stable-prefix
    weight: 2
    text: Allt som är lika i varje anrop (instruktion och handbok) ligger först, och frågan ligger sist i meddelandena.
  - id: breakpoint
    weight: 2
    text: Det finns en `cache_control`-markering direkt efter handboken, inte efter frågan.
  - id: no-invalidators
    weight: 1
    text: Inget i prefixet ändras mellan anrop, till exempel datum, id:n eller frågan själv.
references:
  - { label: good, dir: refs/good, expect: [75, 100] }
  - { label: bad, dir: refs/bad, expect: [0, 55] }
---

En HR-bot svarar på frågor ur en personalhandbok på flera tusen tokens. Utan cache betalar du för hela handboken vid varje fråga.

Skriv `request.json` så att handboken cachas efter första frågan och läses från cachen därefter. `{{file:docs/handbook.md}}` byts mot handboken och `{{input}}` mot frågan.
Dojo skickar de fyra frågorna i ordning. Fråga två till fyra måste läsa minst 1 000 tokens från cachen.

Tips: cachen matchar på exakt prefix, i ordningen `tools`, `system`, `messages`.
