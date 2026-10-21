---
description: Fix a bug ticket - reproduce with a failing test, find the root cause, then the smallest fix
argument-hint: <ticket file or text>
---

Du rättar buggen i $ARGUMENTS. Ingen kod under `src/` får ändras förrän steg 1 och 2 är klara.

## 1. Återskapa
- Läs ärendet: symptom, steg, förväntat och faktiskt resultat. Läs `AGENTS.md` för kommandon och testmönster.
- Skriv ett test som gör exakt det ärendet beskriver och förväntar sig rätt resultat. Lägg det i repots testmönster.
- Kör testet och se det faila av rätt anledning. Går det igenom har du inte återskapat buggen: tänk om innan du går vidare.

## 2. Grundorsak
- Följ koden från anropet i testet tills du hittar raden som ger fel resultat. Rapportörens teorier (till exempel "kanske cachen") är hypoteser: pröva dem mot koden, ta dem inte för givna.
- Skriv `BUGFIX.md` innan du ändrar koden:
  - **Symptom:** vad användaren ser.
  - **Grundorsak:** fil och rad, och varför den ger fel resultat.
  - **Avfärdat:** teorier du prövade och varför de inte stämde.
  - **Fix:** vad du tänker ändra.

## 3. Fixa
- Gör den minsta ändring som rättar grundorsaken. Ingen orelaterad refaktorering.
- Sök efter samma mönster på andra ställen (Grep) och nämn dem i `BUGFIX.md`; rätta dem bara om de har samma fel.
- Ta aldrig bort eller försvaga ett befintligt test för att få grönt.

## 4. Verifiera
- Kör regressionstestet: nu ska det gå igenom. Kör sedan `npm test` och `npm run lint`.
- Lägg till **Verifiering** i `BUGFIX.md`: vilket test som var rött och nu är grönt, och vilka kommandon som körts.

## 5. Rapport
Svara med högst åtta rader: grundorsak (fil:rad), fix, regressionstest och resultatet av testkörningen.
