# Feature-ärende

Kontext först, plan före kod, och ett klart-kriterium du kan bocka av.

## Rutin

1. **Kontext.** Se till att repot har en `AGENTS.md` (eller `CLAUDE.md`) med kommandon och husregler. Låt Claude läsa ärendet, reglerna och den kod och de tester som berörs innan något ändras.
2. **Plan före kod.** Be om en plan i `PLAN.md`: filer som ändras, ordning, öppna frågor. Läs den. Det är billigare att rätta en plan än en diff. I Claude Code kan du också använda plan mode (Shift+Tab).
3. **Klart när.** Gör acceptanskriterierna till en checklista: ett test per kriterium, plus test och lint gröna. Claude är inte klar förrän varje rad är avbockad.
4. **Implementera i små steg.** Kör testerna efter varje steg. Inga orelaterade refaktoreringar.
5. **Delegera rätt.** En subagent passar för att kartlägga en okänd del av en stor kodbas eller för oberoende deluppgifter. En liten, sammanhängande ändring gör huvudagenten själv.
6. **Rapport.** Vad ändrades, hur verifierades det, vad återstår.

## Promptmall

Klistra in i Claude Code och fyll i ärendet:

```text
Ärende (feature):
<KLISTRA IN ÄRENDET: titel, bakgrund, acceptanskriterier, utanför scope>

Arbeta så här, och hoppa inte över något steg:
1. Läs AGENTS.md, ärendet och den kod och de tester som berörs. Följ repots mönster i stället för att gissa.
2. Skriv en plan i PLAN.md innan du ändrar någon kod: mål, filer som ändras och i vilken ordning, öppna frågor. Är något krav oklart: skriv frågan och stanna.
3. Lägg till avsnittet "Klart när" i PLAN.md: ett test per acceptanskriterium, plus att test och lint är gröna.
4. Implementera enligt planen, med tester. Kör testerna efter varje steg. Ändra bara det ärendet kräver.
5. Kör test och lint, och bocka av varje rad under "Klart när".
6. Avsluta med högst tio rader: vad som ändrades, hur det verifierades och vad som återstår.
```

## Som slash-kommando

Spara rutinen som `.claude/commands/feature.md` i ditt projekt, med `$ARGUMENTS` där ärendet ska in. Sedan räcker `/feature <ärende>`. Det är det övningen tränar.

## Vanliga misstag

- Att klistra in ärendet och skriva "fixa det". Claude gissar konventionerna och kodar direkt.
- Att godkänna en plan du inte har läst.
- Att låta "det kompilerar" räknas som klart.

Träna: `dojo run ticket-feature`
