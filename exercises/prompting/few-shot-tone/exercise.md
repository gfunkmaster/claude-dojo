---
id: prompting-few-shot-tone
title: Rätt ton med exempel
skill: prompting
type: prompt
difficulty: 2
model: claude-haiku-5-5
solution: system.md
cases:
  - name: återbetalning
    text: "intern anteckning: kunden fick dubbeldebitering. återbetalt 299 kr idag, syns om 3-5 bankdagar."
    checks:
      - { kind: regex, pattern: "/Teamet på Dojo\\s*$" }
      - { kind: regex, pattern: "!", negate: true }
      - { kind: regex, pattern: "\\b(Ni|Er|Era)\\b", negate: true }
      - { kind: regex, pattern: "299" }
  - name: bugg
    text: "intern anteckning: exporten till pdf trasig sen releasen i tisdags. fix kommer fredag. workaround: exportera som png."
    checks:
      - { kind: regex, pattern: "/Teamet på Dojo\\s*$" }
      - { kind: regex, pattern: "!", negate: true }
      - { kind: regex, pattern: "png", flags: "i" }
      - { kind: regex, pattern: "fredag", flags: "i" }
  - name: nej
    text: "intern anteckning: vi erbjuder inte telefonsupport, hänvisa till chatten."
    checks:
      - { kind: regex, pattern: "/Teamet på Dojo\\s*$" }
      - { kind: regex, pattern: "!", negate: true }
      - { kind: regex, pattern: "chatt", flags: "i" }
criteria:
  - id: examples
    weight: 2
    text: Prompten innehåller två till tre varierade exempel på anteckning och färdigt svar, tydligt avgränsade med taggar.
  - id: rules-explained
    weight: 1
    text: Prompten förklarar varför tonen ser ut som den gör, i stället för att bara räkna upp förbud.
  - id: facts-kept
    weight: 2
    text: Prompten kräver att alla fakta (belopp, datum, lösningar) från anteckningen följer med och att inget läggs till.
references:
  - { label: good, dir: refs/good, expect: [75, 100] }
  - { label: bad, dir: refs/bad, expect: [0, 55] }
---

Supporten skriver korta interna anteckningar. Din prompt gör om dem till svar till kunden i företagets ton:

- svenska, du-tilltal (aldrig "Ni")
- lugnt och varmt, inga utropstecken
- högst fyra meningar
- alla fakta från anteckningen följer med, inget hittas på
- slutar alltid med raden `/Teamet på Dojo`

Regler räcker sällan för en ton. Exempel räcker oftare. Skriv `system.md` med några bra exempel (few-shot).
`regex`-kontrollerna gäller hela svaret.
