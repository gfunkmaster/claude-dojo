# Roadmap: från personlig dojo till elit och företag

Status 2026-10-22. Planen utgår från det som redan finns i repot och svarar på frågan "vad behövs för att Dojo ska bli elit och användbart på ett företag?".

## Utgångsläge

Det här finns redan och planen bygger vidare på det, i stället för att ersätta det:

| Område | Finns i dag |
| --- | --- |
| Övningar | 24 st: 7 färdigheter × 3 nivåer + 3 ticket-övningar. Alla 19 som går på abonnemanget är kalibrerade mot riktig `claude -p`. 5 kräver API. |
| Bedömning | Deterministiska kontroller + en domare (`claude-opus-5-5`, strukturerat svar, valideras med zod). Goda och dåliga referenser per övning, `--calibrate`. |
| Repetition | Leitner-schema härlett ur resultaten, `dojo review`, `dojo stats`. |
| Hjälp | `dojo hint` i tre nivåer. Bara `prompt-extract-invoice` har handskrivna ledtrådar, övriga härleds. |
| Personligt | `dojo analyze` hittar mönster i egna transkript lokalt, `--generate` gör personliga övningar via `claude -p` (bara redigerade utdrag lämnar modulen). |
| Gränssnitt | CLI + lokal webb-UI (127.0.0.1, ingen inloggning). |
| Arbetsflöde | Playbooks för feature, bugfix och research. Ingen Jira-koppling. |
| Utbyggbarhet | `DOJO_EXERCISES` pekar redan om var övningar läses, `DOJO_HOME` var data skrivs. |

Känt mönster från kalibreringen: Claude är så stark att env- och domaruppgifter ofta lyckas även med dålig setup, så kontrollerna slutar skilja bra från dåligt och bara domaren gör det. Det är den största risken för förtroendet och styr ordningen nedan.

## Princip: abonnemanget först

Allt nytt ska fungera på Claude-abonnemanget (`DOJO_BACKEND=claude-cli`), även Team- och Enterprise-planer. Där något kräver API-krediter står det uttryckligen. Två saker att ha i huvudet:

- Fler domaranrop (fas 1) kostar inga pengar på abonnemanget men äter användningsgränsen. Därför ska flerdomarläget vara valbart och användas där det behövs mest.
- CI (fas 6) kan inte logga in med ett abonnemang på ett enkelt sätt. Där körs bara det deterministiska, och modellstegen körs lokalt.

## Faser i prioritetsordning

Storlek: **liten** = en PR på någon dag, **medel** = 2-4 PR:er, **stor** = flera veckor eller löpande.

```
Fas 0  En veckas egen användning
  │
Fas 1  Pålitlig bedömning ─────────────┐
  │                                    │
Fas 2  Företagets egna regler          Fas 3  Integritet och styrning (parallellt)
  │                                    │
Fas 4  Fler och svårare övningar       │
  │                                    │
Fas 5  Flera användare och team ◄──────┘
  │
Fas 6  Integration i arbetsflödet
```

### Fas 0: Använd verktyget en vecka (liten, användaren)

Innan mer byggs ska Dojo användas på riktigt, annars bygger vi på gissningar.

- Kör `dojo next` eller webb-UI:t varje dag, minst en övning.
- Kör `dojo analyze` och `dojo analyze --generate` på egna transkript, och `--calibrate` på de genererade övningarna.
- Skriv ner det som skaver i en lista (vilken övning, vad som kändes fel, om betyget kändes orättvist). Ett betyg som känns fel är den viktigaste signalen för fas 1.

**Beroenden:** inga. **Leverans:** en friktionslista som vi går igenom innan fas 1 startar. Den kan flytta om prioriteringen nedan.

### Fas 1: Pålitlig bedömning (medel)

Ett företag accepterar bara betyg man kan lita på. Allt senare (teamöversikt, CI) är värdelöst om samma lösning får 62 ena gången och 81 nästa.

1. **Mät spridningen (liten).** `dojo run <id> --calibrate --repeat N` kör referenserna N gånger och rapporterar min, median, max och standardavvikelse. Spara i `results/calibration/`. Gör det till en del av kalibreringsstatusen i `dojo list`: en övning med för stor spridning markeras `UNRELIABLE`, precis som en som hamnar utanför sitt intervall.
2. **Fler deterministiska kontroller (medel).** Gå igenom alla övningar där kontrollerna ensamma inte skiljer god från dålig referens (kalibreringen visar det redan). Använd receptet som fungerat: en regel som bara användarens fil kan lära ut, eller striktare fall. Lägg till en test som kräver att kontrollerna ensamma ger den goda referensen klart högre än den dåliga.
3. **Flera domare (medel).** Valbart läge där domaren körs flera gånger (eller med olika modeller, t.ex. Opus + Sonnet) och kriteriebetyget blir medianen. När domarna är oense flaggas kriteriet i resultatet i stället för att ett betyg hittas på. Påverkar resultatschemat, så `schemaVersion` höjs till 2.
4. **Mänsklig kalibreringsmängd (medel).** En mapp per övning med några riktiga lösningar (inte bara god/dålig) som en människa har betygsatt. `dojo calibrate --human` jämför domarens betyg med människans och rapporterar överensstämmelse. Börja med 5 övningar, en per färdighet där det går.

**Beroenden:** fas 0 (friktionslistan visar var det är värst). **Abonnemang:** ja, men flerdomarläget kostar användningsgräns. **Beslut:** se B1 och B2.

### Fas 2: Företagets egna regler som övningar (medel till stor)

Det här är det som gör Dojo användbart på ett företag: att träna på *deras* AGENTS.md, kodstandard och definition of done, inte generiska exempel.

1. **Övningspaket (medel).** Formalisera det `DOJO_EXERCISES` redan gör: ett paket är en mapp eller ett eget git-repo med `pack.yaml` (namn, version, ägare, vilka färdigheter det täcker) och övningsmappar i samma format som i dag. Dojo kan läsa flera paket samtidigt (det inbyggda + företagets). Läroplanstestet gäller per paket med en flagga för att tillåta luckor.
2. **Generera utkast från företagets regler (medel).** `dojo pack draft --from <sökväg>` läser företagets AGENTS.md, kodstandard och DoD och skriver utkast till övningar via `claude -p`, med samma pipeline som `dojo analyze --generate` (validering, krav på god och dålig referens). Typiska övningar: "skriv en AGENTS.md för den här tjänsten som följer våra regler", "få Claude att leverera en ändring som uppfyller vår DoD", "granska den här PR:en mot vår standard".
3. **Kalibrering som grind (liten).** Ett utkast får inte publiceras i paketet förrän `--calibrate` (och från fas 1 `--repeat`) går igenom. Samma regel som i dag, men tvingande.
4. **Exempelpaket (liten).** Ett litet paket byggt på användarens egna regler (från deras AGENTS.md och "definition of done") som visar formatet och testar hela kedjan.

**Beroenden:** fas 1 steg 1-2 (annars blir företagets övningar lika svaga som de första utkasten var). **Abonnemang:** ja. Företagets kod skickas till `claude -p` under företagets eget Claude-avtal, vilket fas 3 dokumenterar. **Beslut:** B3.

### Fas 3: Integritet och styrning (liten till medel, parallellt med fas 2)

Ett säkerhetsteam frågar först "vad lämnar maskinen?". Svaret finns redan i koden men inte på ett ställe de kan läsa.

1. **`docs/SECURITY.md` (liten).** Dataflöde (vad som går till `claude -p` eller API:t, vad som stannar lokalt), lagring (allt under `DOJO_HOME`, gitignorerat), transkriptreglerna i `src/analyze`, hotmodellen för webb-UI:t, vad env-övningar får göra i sin sandlåda och hur `ANTHROPIC_API_KEY` tas bort från underprocesser. Skrivet för någon som inte läser kod.
2. **Policyfil (medel).** En valfri `dojo.policy.json` som en organisation kan låsa: tvinga backend, tillåtna modeller, stänga av `dojo analyze`, kräva att env-övningar körs med en viss behörighetsprofil. Kontrolleras vid start och syns i `dojo stats`.
3. **Granskningsbar logg (liten).** Logga varje modellanrop lokalt (tid, övning, backend, modell, tokens, men inget innehåll) så att man i efterhand kan visa vad som skickats.

**Beroenden:** inga för steg 1, steg 2-3 lättare efter fas 2. **Abonnemang:** ja. **Beslut:** B4.

### Fas 4: Fler och svårare övningar (stor, löpande)

Mål: 80-100 övningar. Elitnivån ska vara svår även för någon som använder Claude dagligen.

1. **Versionering (liten).** `version` i frontmatter, och resultaten sparar vilken version de gällde. Gamla resultat jämförs inte rakt av med nya i statistiken. Schemabyte, samordnas med fas 1 steg 3 så att det blir en enda höjning till `schemaVersion` 2.
2. **Riktiga repon (medel).** Env-övningar mot fixerade öppen källkod-repon (en given commit, som tarball i fixturen, inga nya beroenden) i stället för små leksaksrepon. Ger realistisk kontext-tryck och längre uppgifter.
3. **Nya områden (stor):**
   - MCP-säkerhet: förgiftade verktygsbeskrivningar, för breda behörigheter, att granska en tredjeparts-server.
   - Prompt injection i agentkontext: en fil i repot eller ett verktygssvar som försöker ta över Claude Code.
   - Kostnadsbudgetar: lös uppgiften under en viss kostnad och antal turer (kontrollerna finns redan, övningarna saknas).
   - Långa uppgifter: planering och delegering till subagenter över många steg, återhämtning när något går fel.
   - Granska AI-skriven kod och felsöka en agent som fastnat i en loop.
4. **Ledtrådar för alla (medel).** Handskrivna `hints` och `explanation` för de 23 övningar som saknar dem.

**Beroenden:** fas 1 (varje ny övning ska klara spridningskravet). **Abonnemang:** ja, utom eventuella nya `tools`/`request`-övningar. **Beslut:** B5.

### Fas 5: Flera användare och team-översikt (stor)

En teamledare ska se hur teamet ligger till per färdighet, utan att någon delar transkript, lösningar eller rå data.

1. **Export (medel).** `dojo export --team` skriver en sammanfattning per användare: behärskning och trend per färdighet, antal pass, mest missade kriterier. Inga lösningar, inga transkript, ingen domartext. Användaren ser exakt vad som exporteras innan det skrivs. Schema i `src/core`, dokumenterat i README:s "Data on disk".
2. **Insamling utan server (medel).** Exporterna läggs i ett delat git-repo eller en delad mapp. Ingen server att drifta, och webb-UI:ts lokala hotmodell håller.
3. **Teamvy (medel).** `dojo team <mapp>` och en sida i webb-UI:t som läser exporterna: färdighetskarta för teamet, vilka övningar som är svårast, vilka färdigheter ingen behärskar. Visar aggregat, enskilda personer bara om de valt det.

**Beroenden:** fas 1 (betygen måste gå att jämföra mellan personer), fas 3 (säkerhetsteamet godkänner vad som delas), fas 4 steg 1 (versioner, så att man jämför samma övning). **Abonnemang:** ja, inga modellanrop. **Beslut:** B6.

### Fas 6: Integration i arbetsflödet (medel)

1. **CI för övningspaket (liten).** En GitHub Action-mall för företagets paket-repo: schema, läroplan och deterministiska kontroller mot referenserna. Modellstegen (domaren) körs lokalt med `--calibrate` innan merge, eftersom CI inte har abonnemanget.
2. **Kontroll av AGENTS.md i företagets repon (medel).** `dojo lint-context` kör de deterministiska delarna av kontextövningarna mot ett riktigt repo: finns kommandona, stämmer de mot `package.json`, är filen för lång. Kan köras i CI utan modell.
3. **Veckorapport (liten).** `dojo report --week` skriver en kort markdown: vad du tränat, vad som förbättrats, vad som är dags att repetera. Kan schemaläggas lokalt.
4. **Jira (medel, senare).** Först utan integration: en stängd ticket klistras in och blir ett utkast till övning via playbook-flödet. En riktig koppling via MCP-connector först när det finns ett konkret behov.

**Beroenden:** fas 2 (paket att köra CI på), fas 5 för veckorapport på teamnivå. **Abonnemang:** ja lokalt. CI kör bara deterministiska steg, om inte B7 säger annat.

## Beslut som kräver dig

| # | Fråga | Behövs före | Mitt förslag |
| --- | --- | --- | --- |
| B1 | Hur mycket spridning tolererar vi? | Fas 1 steg 1 | Standardavvikelse ≤ 8 poäng på referenserna över 3 körningar. |
| B2 | Flera domare: samma modell flera gånger eller olika modeller? | Fas 1 steg 3 | 3 körningar med Opus som standard, Sonnet som andra åsikt bara vid oenighet. Sparar användningsgräns. |
| B3 | Var bor företagspaket, och vem får skriva dem? | Fas 2 | Eget git-repo per företag/team, ägs av den som äger AGENTS.md. Dojo-repot innehåller bara formatet och ett exempel. |
| B4 | Behövs policyfilen nu eller räcker dokumentet? | Fas 3 steg 2 | Bara dokumentet tills ett riktigt företag frågar. |
| B5 | Vilka öppen källkod-repon används som riktiga fixturer? | Fas 4 steg 2 | Små, välkända TypeScript-repon med MIT-licens och bra tester. |
| B6 | Vad får delas i teamvyn, och med namn eller pseudonym? | Fas 5 | Bara aggregat per färdighet, pseudonym som standard, namn om personen väljer det. |
| B7 | Ska modellsteg köras i CI (kräver API-nyckel eller token)? | Fas 6 | Nej till att börja med. |
| B8 | Behöver de 5 API-övningarna en abonnemangsvariant? | Fas 4 | Ja på sikt: en variant som bedömer requesten statiskt utan att skicka den. |

## Första etappen

När veckan i fas 0 är klar, i den här ordningen:

1. **Gå igenom friktionslistan** (30 min). Justera ordningen ovan om något stort dyker upp.
2. **PR 1: `--repeat` och spridning i kalibreringen** (liten). Kör det på alla 19 abonnemangsövningar och lista de som inte håller. Kräver B1.
3. **PR 2: Starkare kontroller** för de övningar PR 1 pekar ut, plus testet som kräver att kontrollerna ensamma skiljer god från dålig (medel).
4. **PR 3: `docs/SECURITY.md`** (liten). Kan göras samtidigt som PR 1-2, ingen kod.
5. **Beslut B3** om var företagspaket bor, så att fas 2 kan starta direkt efter.

Klart när: alla 19 abonnemangsövningar har en uppmätt spridning inom gränsen, kontrollerna skiljer god från dålig utan domaren, och säkerhetsdokumentet finns. Då är grunden pålitlig nog att bygga företagets egna övningar på.
