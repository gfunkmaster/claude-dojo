---
id: tools-mcp-server
title: En egen MCP-server
skill: tools
type: env
difficulty: 3
solution: .mcp.json
env:
  fixture: [../../_shared/tool-log, fixture]
  maxTurns: 10
  maxCostUsd: 0.75
  allowedTools: [Write, mcp__orders__get_order_status]
cases:
  - name: orderstatus
    task: Vilken status har order 1042 och order 1077? Skriv svaret i ANSWER.md.
    checks:
      - { kind: file-contains, path: .dojo/tools.log, pattern: "mcp__orders__get_order_status" }
      - { kind: file-contains, path: ANSWER.md, pattern: "skickad" }
      - { kind: file-contains, path: ANSWER.md, pattern: "väntar på betalning" }
criteria:
  - id: protocol
    weight: 2
    text: Servern följer MCP över stdio. Den svarar på `initialize`, `tools/list` och `tools/call`, ignorerar notifieringar och skriver aldrig något annat än JSON-RPC på stdout.
  - id: tool-design
    weight: 2
    text: Verktyget har en tydlig beskrivning och ett inputschema med `required`, och okända order-id ger ett begripligt fel med `isError` i stället för en krasch.
  - id: config
    weight: 1
    text: "`.mcp.json` startar servern med en sökväg som fungerar oavsett arbetskatalog."
references:
  - { label: good, dir: refs/good, expect: [75, 100] }
  - { label: bad, dir: refs/bad, expect: [0, 55] }
---

MCP låter Claude använda dina egna verktyg. En MCP-server över stdio läser JSON-RPC-meddelanden, ett per rad, på stdin och svarar på stdout.

Skriv en server utan beroenden i `mcp/orders-server.mjs` och registrera den som `orders` i `.mcp.json`. Den ska ha verktyget `get_order_status` med input `{ "order_id": "1042" }`, och svaret ska läsas från `data/orders.json`.

Claude får bara använda ditt verktyg och `Write`, inte läsa filer, så servern måste fungera för att svaret ska bli rätt.
Kräver att `claude` är installerat och inloggat.
