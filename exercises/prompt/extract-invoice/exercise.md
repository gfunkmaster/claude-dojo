---
id: prompt-extract-invoice
title: Extrahera fakturadata
skill: prompting
type: prompt
difficulty: 1
model: claude-haiku-5-5
solution: system.md
cases:
  - name: svensk faktura med moms
    input: inputs/01-sv-vat.txt
    checks:
      - { kind: json-valid }
      - { kind: json-path, path: $.invoiceNumber, equals: "2026-0412" }
      - { kind: json-path, path: $.date, equals: "2026-09-14" }
      - { kind: json-path, path: $.total, equals: 1249.5 }
      - { kind: json-path, path: $.vat, equals: 249.9 }
      - { kind: json-path, path: $.currency, equals: SEK }
  - name: engelsk faktura utan moms
    input: inputs/02-en-no-vat.txt
    checks:
      - { kind: json-valid }
      - { kind: json-path, path: $.total, equals: 480 }
      - { kind: json-path, path: $.vat, equals: null }
      - { kind: json-path, path: $.currency, equals: USD }
  - name: fakturanummer saknas
    input: inputs/03-missing-number.txt
    checks:
      - { kind: json-valid }
      - { kind: json-path, path: $.invoiceNumber, equals: null }
      - { kind: json-path, path: $.total, equals: 3100 }
  - name: inte en faktura
    input: inputs/04-not-invoice.txt
    checks:
      - { kind: json-valid }
      - { kind: json-path, path: $.error, equals: not_an_invoice }
criteria:
  - id: no-invented-values
    weight: 2
    text: Prompten säger uttryckligen att saknade värden ska bli null och att inget får gissas eller räknas fram.
  - id: exact-schema
    weight: 2
    text: Prompten anger exakt JSON-format med fältnamn, typer och datumformat, och att svaret bara ska vara JSON.
  - id: handles-non-invoice
    weight: 1
    text: Prompten säger vad som ska hända när indata inte är en faktura.
  - id: concise
    weight: 1
    text: Prompten är kort och saklig, utan upprepningar eller onödig rollspelstext.
references:
  - { label: good, dir: refs/good, expect: [75, 100] }
  - { label: bad, dir: refs/bad, expect: [0, 50] }
hints:
  - Skriv ut JSON-formen ordagrant i prompten, med typ för varje fält. En liten modell följer ett exempel bättre än en beskrivning.
  - Gå igenom fälten ett i taget och säg vad som gäller när värdet saknas. "null, gissa aldrig" behöver stå uttryckligen.
  - Fall 4 är inte en faktura. Vad ska modellen svara då, exakt?
explanation: |
  Prompten visar exakt den JSON som ska tillbaka och säger att inget annat får stå i svaret, så modellen har inget att improvisera kring.

  Varje fält får en egen rad med format och regel för när det saknas. Därför blir saknad moms null i stället för ett uträknat belopp.

  Fallet "inte en faktura" har ett eget, exakt svar. Den dåliga referensen saknar både det och null-regeln, och gissar därför.
---

Skriv en systemprompt i `system.md` som gör om en faktura i fritext till JSON.
Modellen får fakturan som användarmeddelande och ska svara med exakt ett JSON-objekt:

```json
{
  "invoiceNumber": "string eller null",
  "date": "YYYY-MM-DD eller null",
  "seller": "string eller null",
  "total": 0.0,
  "vat": 0.0,
  "currency": "ISO 4217-kod, t.ex. SEK"
}
```

- `total` är beloppet att betala, inklusive moms. `vat` är momsbeloppet, eller `null` om fakturan inte anger moms.
- Värden som inte står i fakturan ska vara `null`. Inget får gissas.
- Om texten inte är en faktura ska svaret vara `{"error": "not_an_invoice"}`.

Prompten körs mot `claude-haiku-5-5`, så den måste vara tydlig nog för en liten modell.
