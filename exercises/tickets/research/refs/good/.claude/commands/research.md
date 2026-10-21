---
description: Research spike - bounded question, parallel subagents for breadth, sources kept apart from conclusions
argument-hint: <ticket file or text>
allowed-tools: Read, Glob, Grep, Write, Agent, Task
---

Du utreder research-ärendet i $ARGUMENTS. Det här är en spike: ändra ingen kod, ingen konfiguration och inga dokument. Den enda fil du skriver är `RESEARCH.md`.

## 1. Avgränsa
- Läs ärendet och `AGENTS.md`. Formulera frågan i en eller två meningar: vad som ska besvaras, vad som räknas som svar och vad som inte ingår.
- Lista vilka områden (tjänster, moduler, dokument) som berörs. Ta bara med det som kan påverka svaret.
- Går frågan inte att avgränsa: skriv bara `## Fråga` med det som är oklart och stanna.

## 2. Bredd med subagenter
Håll din egen kontext liten: läs inte koden själv. Starta en subagent per berört område, alla i samma tur så att de körs parallellt. Ge var och en en fristående instruktion:

"Undersök `<sökväg>` för frågan: <den avgränsade frågan>. Läs bara filer i den mappen och den delade konfigurationen den använder. Svara med en punktlista, en punkt per fynd: `fil:rad: vad koden gör`. Avsluta med en rad `Bedömning: ja | nej | delvis` och en mening om varför. Gissa inte: skriv `okänt` om koden inte avgör saken."

Låt en subagent till läsa dokumentationen (till exempel `docs/adr/`) och svara med vad den påstår, med fil och rad.

## 3. Väg samman
- När kod och dokumentation säger emot varandra gäller koden. Nämn motsägelsen.
- Kontrollera själv de rader som avgör en bedömning, inte allt.

## 4. Skriv `RESEARCH.md`
- `## Fråga`: den avgränsade frågan.
- `## Fynd`: tabellen `| Tjänst | Idempotent | Källa |`, en rad per berörd tjänst, `ja`, `nej` eller `delvis`, källan som `fil:rad`. Bara fakta här, inga råd.
- `## Slutsats`: tolkning och rekommendation, med vilka fynd de bygger på.
- `## Osäkerheter`: det som inte är klarlagt och det du inte undersökte.

## 5. Svara
Högst sex rader: svaret på frågan, rekommendationen och var underlaget finns.
