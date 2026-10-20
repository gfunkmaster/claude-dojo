---
id: api-pick-model
title: Rätt modell och rätt inställningar
skill: api
type: request
difficulty: 1
solution: request.json
cases:
  - name: nöjd
    text: Tack, supporten löste allt på fem minuter!
    checks:
      - { kind: regex, pattern: "^\\s*positive\\s*$" }
      - { kind: max-cost, usd: 0.0002 }
  - name: arg
    text: Tredje gången den här veckan som appen kraschar. Jag säger upp mig.
    checks:
      - { kind: regex, pattern: "^\\s*negative\\s*$" }
      - { kind: max-cost, usd: 0.0002 }
  - name: neutral
    text: Vilka öppettider har ni i helgen?
    checks:
      - { kind: regex, pattern: "^\\s*neutral\\s*$" }
      - { kind: max-cost, usd: 0.0002 }
criteria:
  - id: right-model
    weight: 2
    text: Den minsta modellen som klarar uppgiften är vald, och effort är satt lågt för en så enkel uppgift.
  - id: tight-limits
    weight: 1
    text: max_tokens är satt lågt nog för ett svar på ett ord men med marginal, inte på maxvärdet.
  - id: clear-format
    weight: 1
    text: Systemprompten anger de tre etiketterna och att svaret bara ska vara etiketten.
references:
  - { label: good, dir: refs/good, expect: [75, 100] }
  - { label: bad, dir: refs/bad, expect: [0, 55] }
---

Ett enkelt klassificeringsjobb körs miljontals gånger om dagen, så varje anrop måste vara billigt.

`request.json` är kroppen i ett anrop till Messages API. Dojo skickar den en gång per testfall med meddelandet som användartur (eller där du skriver `{{input}}`).
Gör om anropet så att svaret är exakt en av `positive`, `negative` eller `neutral`, och så att varje anrop kostar under $0.0002.

Tillåtna modeller: `claude-haiku-5-5`, `claude-sonnet-5-5`, `claude-opus-5-5`. Priserna finns i `src/core/pricing.ts`.
