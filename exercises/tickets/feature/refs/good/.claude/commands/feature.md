---
description: Implement a feature ticket - context first, plan before code, explicit definition of done
argument-hint: <ticket file or text>
---

Du implementerar feature-ärendet i $ARGUMENTS. Arbeta i den här ordningen och hoppa inte över något steg.

## 1. Kontext
- Läs ärendet i sin helhet, inklusive "utanför scope".
- Läs `AGENTS.md` (eller `CLAUDE.md`) för kommandon och husregler.
- Läs koden och de tester som berörs, och följ deras mönster. Gissa inte konventioner du kan läsa dig till.
- Om ärendet rör en del av koden du inte hittar i, låt en subagent (Explore) kartlägga den och svara med filer och mönster. För en liten, sammanhängande ändring som den här behövs ingen subagent: delegera bara oberoende deluppgifter.

## 2. Plan (innan du ändrar någon kod)
Skriv `PLAN.md`. Det ska vara den första filen du skriver. Den innehåller:
- **Mål:** ärendet i en mening.
- **Ändringar:** vilka filer du ändrar eller skapar, och i vilken ordning.
- **Klart när:** en checklista med ett test per acceptanskriterium, plus `npm test` och `npm run lint` gröna.
- **Öppna frågor:** sådant ärendet inte avgör. Om ett krav är oklart eller motsägelsefullt: skriv frågan här, stanna och rapportera i stället för att gissa.

## 3. Implementera
- Följ planen. Ändra bara det ärendet kräver; inga orelaterade refaktoreringar.
- Skriv ett test för varje acceptanskriterium, i repots testmönster.
- Kör `npm test` efter varje steg.

## 4. Klart
- Kör `npm test` och `npm run lint`. Båda ska vara gröna.
- Bocka av varje rad under **Klart när** i `PLAN.md`. En rad du inte kan bocka av betyder att du inte är klar.

## 5. Rapport
Svara med högst tio rader: vad som ändrades (filer), hur det verifierades (vilka tester, vilka kommandon), och vad som återstår eller ligger utanför scope.
