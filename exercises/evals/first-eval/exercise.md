---
id: evals-first-eval
title: Din första eval
skill: evals
type: eval
difficulty: 1
model: claude-haiku-5-5
solution: eval.yaml
eval:
  variants:
    - { file: variants/good.md, shouldPass: true }
    - { file: variants/broken-capitalized.md, shouldPass: false }
criteria:
  - id: one-per-label
    weight: 2
    text: Det finns minst ett testfall per etikett (positive, negative, neutral).
  - id: exact-match
    weight: 2
    text: Kontrollerna kräver exakt svar med ankare (`^...$`), inte bara att ordet finns någonstans.
  - id: realistic
    weight: 1
    text: Testfallen ser ut som riktiga kundmeddelanden, inte som konstruerade ettordsexempel.
references:
  - { label: good, dir: refs/good, expect: [75, 100] }
  - { label: bad, dir: refs/bad, expect: [0, 55] }
---

En eval är en uppsättning testfall som säger om en prompt fungerar. Det är så du vet att en ändring blev bättre och inte bara annorlunda.

En prompt klassar kundmeddelanden som `positive`, `negative` eller `neutral`. Svaret ska vara exakt etiketten med gemener.
Skriv `eval.yaml` med minst tre testfall. Dojo kör den mot två dolda varianter av prompten: en som fungerar och en trasig. Den trasiga ska fällas.

Format:

```yaml
cases:
  - name: tack
    text: "Tack för hjälpen!"
    checks:
      - { kind: regex, pattern: "^positive$" }
```
