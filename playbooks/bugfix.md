# Bugg-ärende

Återskapa med ett test, hitta grundorsaken, gör den minsta fixen.

## Rutin

1. **Ge Claude det den behöver.** Symptom, steg för att återskapa, förväntat och faktiskt resultat, felmeddelande eller stacktrace, och vilka filer du misstänker. Ju närmare du pekar, desto mindre letar Claude.
2. **Återskapa först.** Be om ett test som visar felet och se det faila av rätt anledning, innan någon kod ändras.
3. **Grundorsak före fix.** Be om fil och rad och varför den ger fel. Rapportörens teorier ("kanske cachen") är hypoteser som ska prövas mot koden.
4. **Minsta fix.** Rätta grundorsaken, inte symptomet. Inga orelaterade refaktoreringar. Sök efter samma mönster på andra ställen.
5. **Regressionstest.** Testet från steg 2 ska nu vara grönt, och hela sviten grön. Befintliga tester får aldrig tas bort eller försvagas för att få grönt.
6. **Rapport.** Orsak, fix, hur det verifierades.

## Promptmall

Klistra in i Claude Code och fyll i:

```text
Bugg:
<KLISTRA IN ÄRENDET>

Felmeddelande / logg:
<KLISTRA IN, eller "inget">

Misstänkta filer: <sökvägar, eller "vet inte">

Arbeta så här. Ändra ingen produktionskod förrän steg 1 och 2 är klara:
1. Skriv ett test som återskapar felet enligt ärendet och kör det. Det ska faila av rätt anledning. Går det igenom: stanna och berätta vad du ser.
2. Hitta grundorsaken: fil och rad, och varför den ger fel resultat. Pröva teorierna i ärendet mot koden i stället för att ta dem för givna. Skriv orsaken i BUGFIX.md.
3. Gör den minsta ändring som rättar grundorsaken. Sök efter samma mönster på andra ställen och nämn dem.
4. Kör regressionstestet (nu grönt), hela testsviten och lint. Ta aldrig bort eller försvaga ett befintligt test.
5. Avsluta med högst åtta rader: grundorsak (fil:rad), fix, regressionstest och testresultat.
```

## Som slash-kommando

Spara rutinen som `.claude/commands/bugfix.md` med `$ARGUMENTS` för ärendet. Sedan räcker `/bugfix <ärende>`.

## Vanliga misstag

- "Fixa buggen" utan repro. Du får en ändring som får symptomet att försvinna, utan att någon vet varför.
- Ett test som skrivs efter fixen och aldrig har varit rött. Det bevisar ingenting.
- Att låta Claude ändra ett befintligt test tills det går igenom.

Träna: `dojo run ticket-bugfix`
