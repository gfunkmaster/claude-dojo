---
id: evals-llm-judge
title: En LLM-domare som fångar påhitt
skill: evals
type: prompt
difficulty: 3
model: claude-sonnet-5-5
solution: system.md
cases:
  - name: trogen sammanfattning
    input: inputs/01-faithful.txt
    checks:
      - { kind: json-valid }
      - { kind: json-path, path: $.faithful, equals: true }
      - { kind: json-path, path: $.unsupported_claims, equals: [] }
  - name: påhittad siffra
    input: inputs/02-wrong-number.txt
    checks:
      - { kind: json-valid }
      - { kind: json-path, path: $.faithful, equals: false }
      - { kind: regex, pattern: "ökade med 40 procent" }
  - name: påhittad orsak
    input: inputs/03-invented-cause.txt
    checks:
      - { kind: json-valid }
      - { kind: json-path, path: $.faithful, equals: false }
      - { kind: regex, pattern: "tack vare den nya prismodellen" }
  - name: kort men trogen
    input: inputs/04-short-faithful.txt
    checks:
      - { kind: json-valid }
      - { kind: json-path, path: $.faithful, equals: true }
      - { kind: json-path, path: $.unsupported_claims, equals: [] }
  - name: utdragen prognos
    input: inputs/05-stretched-outlook.txt
    checks:
      - { kind: json-valid }
      - { kind: json-path, path: $.faithful, equals: false }
      - { kind: regex, pattern: "under hela 2027" }
  - name: lånad orsak
    input: inputs/06-swapped-cause.txt
    checks:
      - { kind: json-valid }
      - { kind: json-path, path: $.faithful, equals: false }
      - { kind: regex, pattern: "tack vare nyanställningarna inom support" }
criteria:
  - id: claim-by-claim
    weight: 2
    text: Domaren delar upp sammanfattningen i påståenden och kontrollerar vart och ett mot källan, innan den ger ett utlåtande.
  - id: one-question
    weight: 2
    text: Domaren bedömer bara trohet mot källan, inte stil, längd eller vad som saknas.
  - id: evidence
    weight: 1
    text: Varje påstående som inte stöds listas ordagrant i `unsupported_claims`, så att utlåtandet går att kontrollera.
references:
  - { label: good, dir: refs/good, expect: [75, 100] }
  - { label: bad, dir: refs/bad, expect: [0, 55] }
---

Dojo använder själv en LLM-domare. Nu bygger du en.

Domaren får en källtext och en sammanfattning i användarmeddelandet, i taggarna `<source>` och `<summary>`. Skriv `system.md` så att den svarar med exakt:

```json
{ "faithful": true, "unsupported_claims": [] }
```

`faithful` är `false` om sammanfattningen påstår något som inte står i källan, till exempel en annan siffra eller en orsak som källan inte nämner. En kort sammanfattning som utelämnar saker är fortfarande trogen. `unsupported_claims` listar varje sådant påstående ordagrant som det står i sammanfattningen, så att man kan söka upp det.
