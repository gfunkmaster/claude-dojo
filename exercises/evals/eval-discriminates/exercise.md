---
id: evals-eval-discriminates
title: Eval som skiljer bra prompt från trasig
skill: evals
type: eval
difficulty: 2
model: claude-haiku-5-5
solution: eval.yaml
eval:
  variants:
    - { file: variants/good.md, shouldPass: true }
    - { file: variants/broken-format.md, shouldPass: false }
    - { file: variants/broken-no-other.md, shouldPass: false }
criteria:
  - id: covers-edge-cases
    weight: 2
    text: Evalen har testfall för kantfall, till exempel ärenden som inte passar någon kategori och ärenden som nämner flera saker.
  - id: strict-format
    weight: 2
    text: Kontrollerna kräver exakt format (bara etiketten, gemener) i stället för att bara leta efter ett ord någonstans i svaret.
  - id: no-redundancy
    weight: 1
    text: Testfallen överlappar inte. Varje fall testar något som de andra inte gör.
references:
  - { label: good, dir: refs/good, expect: [75, 100] }
  - { label: bad, dir: refs/bad, expect: [0, 55] }
---

En prompt sorterar supportärenden i en av fyra kategorier: `billing`, `bug`, `feature` eller `other`.
Svaret ska bara vara etiketten, med gemener.

Skriv en eval i `eval.yaml` som avgör om en version av prompten fungerar. Dojo kör din eval mot tre dolda varianter av prompten med `claude-haiku-5-5`:

- en som fungerar, och som ska klara alla dina testfall
- två som är trasiga på olika sätt, och som ska fälla minst ett av dina testfall var

Formatet är detsamma som `cases` i en övning: varje fall har ett `name`, en `text` (ärendet) och en lista `checks`.
`regex`-kontrollen gäller hela svaret, så `^billing$` kräver att svaret bara är ordet billing.
Du behöver minst tre testfall. Du ser inte varianterna, så tänk på vilka fel en sådan prompt brukar ha.
