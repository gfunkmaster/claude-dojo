# Research-ärende

En avgränsad fråga, subagenter för bredden, fynd med källor skilda från slutsatser.

## Rutin

1. **Avgränsa frågan.** Vad ska besvaras, vad räknas som svar, vad ingår inte, och hur lång är timeboxen. En vag fråga ger en vag rapport.
2. **Ingen kod.** En spike ändrar ingenting. Säg det uttryckligen, och ge Claude bara verktyg som läser plus att skriva rapporten.
3. **Bredd med subagenter.** En subagent per tjänst, modul eller källa, parallellt, med en fristående instruktion och ett fast svarsformat (`fil:rad: vad koden gör`). Huvudagentens kontext hålls liten och fri från allt som lästes.
4. **Kod före dokumentation.** När de säger emot varandra gäller koden, och motsägelsen är ett fynd i sig.
5. **Fynd skilt från slutsats.** Först fakta med källa, sedan tolkning och rekommendation, sedan det som är osäkert eller inte undersöktes.
6. **Ett beslutsunderlag.** Rapporten ska gå att fatta beslut på utan att läsa koden.

## Promptmall

Klistra in i Claude Code och fyll i:

```text
Research (spike):
<KLISTRA IN ÄRENDET>

Regler: ändra ingen kod, konfiguration eller dokumentation. Den enda fil du skriver är RESEARCH.md.

1. Formulera frågan i en eller två meningar: vad som ska besvaras, vad som räknas som svar och vad som inte ingår. Lista de områden som kan påverka svaret.
2. Läs inte koden själv. Starta en subagent per område, parallellt, med instruktionen: "Undersök <sökväg> för frågan <frågan>. Svara med en punktlista `fil:rad: vad koden gör`, och avsluta med en bedömning. Skriv `okänt` om koden inte avgör saken."
3. Väg samman svaren. Säger kod och dokumentation emot varandra gäller koden; nämn motsägelsen.
4. Skriv RESEARCH.md med rubrikerna: Fråga, Fynd (bara fakta, med fil:rad), Slutsats (tolkning och rekommendation), Osäkerheter.
5. Svara med högst sex rader: svaret, rekommendationen och var underlaget finns.
```

## Som slash-kommando

Spara rutinen som `.claude/commands/research.md` med `$ARGUMENTS` för ärendet och `allowed-tools: Read, Glob, Grep, Write, Agent` i frontmattern. Sedan räcker `/research <ärende>`.

## Vanliga misstag

- "Kolla upp det här": Claude läser hela repot i en kontext och tappar tråden.
- En slutsats utan källor, eller källor blandade med åsikter.
- Att lita på en ADR eller README utan att kontrollera koden.

Träna: `dojo run ticket-research`
