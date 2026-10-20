---
id: tools-describe-tools
title: Verktygsbeskrivningar som styr rätt
skill: tools
type: tools
difficulty: 1
model: claude-haiku-5-5
solution: tools.json
cases:
  - name: väder
    text: Blir det regn i Malmö i morgon?
    checks:
      - { kind: json-path, path: $.tool, equals: get_forecast }
      - { kind: json-path, path: $.input.city, equals: Malmö }
  - name: dokumentation
    text: Hur slår jag på SSO i adminpanelen?
    checks:
      - { kind: json-path, path: $.tool, equals: search_docs }
  - name: ärende
    text: Kunden kan inte logga in alls och är jättearg. Lägg ett ärende med hög prioritet.
    checks:
      - { kind: json-path, path: $.tool, equals: create_ticket }
      - { kind: json-path, path: $.input.priority, equals: high }
  - name: småprat
    text: Hej! Hur är läget?
    checks:
      - { kind: json-path, path: $.tool, equals: null }
criteria:
  - id: when-to-use
    weight: 2
    text: Varje beskrivning säger när verktyget ska användas, och när det inte ska användas.
  - id: parameters
    weight: 2
    text: Varje parameter har en beskrivning med format och exempel, och enum används där värdena är kända.
  - id: distinct
    weight: 1
    text: Beskrivningarna överlappar inte, så modellen kan inte blanda ihop verktygen.
references:
  - { label: good, dir: refs/good, expect: [75, 100] }
  - { label: bad, dir: refs/bad, expect: [0, 55] }
---

Modellen väljer verktyg nästan bara utifrån namn och beskrivning.
I `tools.json` finns tre verktyg med usla beskrivningar. Skriv om dem så att `claude-haiku-5-5` väljer rätt verktyg med rätt argument, och inget verktyg alls när det inte behövs.

Behåll verktygens namn och parameternamn (`city`, `query`, `title`, `priority`). Du får lägga till en `system`-prompt, beskrivningar, `enum` och `required`.

Formatet är `{"system": "...", "tools": [{"name", "description", "input_schema"}]}`. Dojo skickar varje testfall med dina verktyg och kontrollerar det första verktygsanropet.
