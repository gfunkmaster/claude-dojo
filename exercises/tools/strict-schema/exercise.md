---
id: tools-strict-schema
title: Ett schema som tvingar fram rätt argument
skill: tools
type: tools
difficulty: 2
model: claude-haiku-5-5
solution: tools.json
cases:
  - name: fullständig bokning
    text: Boka 30 minuter med anna@acme.se och bo@acme.se på torsdag 2026-10-22 kl 14, Stockholmstid.
    checks:
      - { kind: json-path, path: $.tool, equals: book_meeting }
      - { kind: json-path, path: $.input.duration_minutes, equals: 30 }
      - { kind: json-path, path: $.input.attendees, equals: ["anna@acme.se", "bo@acme.se"] }
      - { kind: json-path, path: $.input.start, equals: "2026-10-22T14:00" }
      - { kind: json-path, path: $.input.timezone, equals: Europe/Stockholm }
  - name: kvart i London
    text: Ett snabbt möte på en kvart med kim@acme.co.uk fredag 2026-10-23 klockan 9 London-tid.
    checks:
      - { kind: json-path, path: $.tool, equals: book_meeting }
      - { kind: json-path, path: $.input.duration_minutes, equals: 15 }
      - { kind: json-path, path: $.input.timezone, equals: Europe/London }
  - name: info saknas
    text: Boka ett möte med Kim.
    checks:
      - { kind: json-path, path: $.tool, equals: null }
criteria:
  - id: types
    weight: 2
    text: Schemat har rätt typer (heltal för minuter, array av e-poststrängar) och `required` för alla fält.
  - id: enums-formats
    weight: 2
    text: Tidszon är en `enum`, och starttidens format är beskrivet exakt med exempel.
  - id: strict
    weight: 1
    text: Verktyget använder `strict` och `additionalProperties false`, så modellen inte kan hitta på fält.
  - id: missing-info
    weight: 1
    text: Beskrivningen säger att modellen ska fråga i stället för att gissa när något saknas.
references:
  - { label: good, dir: refs/good, expect: [75, 100] }
  - { label: bad, dir: refs/bad, expect: [0, 55] }
---

Ett bokningssystem tar emot exakt de här fälten:

| fält | typ | exempel |
| --- | --- | --- |
| `duration_minutes` | heltal | `30` |
| `attendees` | lista med e-postadresser | `["anna@acme.se"]` |
| `start` | lokal tid `YYYY-MM-DDTHH:MM` | `"2026-10-22T14:00"` |
| `timezone` | en av `Europe/Stockholm`, `Europe/London`, `America/New_York` | `"Europe/London"` |

Skriv verktyget `book_meeting` i `tools.json` så att modellen alltid skickar giltiga argument. Om något saknas ska den fråga användaren i stället för att anropa verktyget.
