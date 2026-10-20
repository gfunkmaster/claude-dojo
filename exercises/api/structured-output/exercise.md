---
id: api-structured-output
title: Garanterad JSON med structured outputs
skill: api
type: request
difficulty: 3
solution: request.json
cases:
  - name: annons med pris
    text: "Säljes: Fjällräven Kånken, grön, nyskick. 650 kr. Finns i lager, hämtas i Uppsala."
    checks:
      - { kind: json-valid }
      - { kind: json-path, path: $.name, equals: "Fjällräven Kånken" }
      - { kind: json-path, path: $.price_sek, equals: 650 }
      - { kind: json-path, path: $.in_stock, equals: true }
      - { kind: json-path, path: $.condition, equals: like_new }
      - { kind: max-cost, usd: 0.001 }
  - name: slutsåld
    text: "Tyvärr slut: Moccamaster KBG Select (begagnad, fungerar fint). Pris var 1 200 kronor."
    checks:
      - { kind: json-valid }
      - { kind: json-path, path: $.price_sek, equals: 1200 }
      - { kind: json-path, path: $.in_stock, equals: false }
      - { kind: json-path, path: $.condition, equals: used }
      - { kind: max-cost, usd: 0.001 }
  - name: pris saknas
    text: "Ny iPad Air 13 tum, oöppnad kartong. Skicka bud!"
    checks:
      - { kind: json-valid }
      - { kind: json-path, path: $.price_sek, equals: null }
      - { kind: json-path, path: $.condition, equals: new }
      - { kind: max-cost, usd: 0.001 }
criteria:
  - id: schema-not-prose
    weight: 2
    text: Formatet tvingas fram med `output_config.format` och ett JSON-schema, inte bara med en instruktion i prompten.
  - id: schema-quality
    weight: 2
    text: Schemat har `required` för alla fält, `additionalProperties false`, en `enum` för skick och null tillåtet för pris.
  - id: cheap
    weight: 1
    text: Anropet använder en liten modell och låg effort, eftersom schemat redan bär formatet.
references:
  - { label: good, dir: refs/good, expect: [75, 100] }
  - { label: bad, dir: refs/bad, expect: [0, 55] }
---

En sajt med begagnatannonser behöver strukturerad data ur fritext. Ett enda trasigt JSON-svar kraschar importen, så "svara med JSON" i prompten räcker inte.

Skriv `request.json` så att svaret alltid är ett JSON-objekt med exakt de här fälten:

| fält | typ |
| --- | --- |
| `name` | sträng |
| `price_sek` | heltal eller `null` |
| `in_stock` | boolean |
| `condition` | `new`, `like_new` eller `used` |

Använd structured outputs (`output_config.format` med ett JSON-schema). Varje anrop får kosta högst $0.001.
