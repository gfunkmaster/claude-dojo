# DOJO-305: Spike: dubbla mejl och fakturor vid betalningar

**Typ:** Spike · **Timebox:** 2 timmar · **Komponent:** checkout, billing, notifications · **Rapportör:** Lina (PO)

## Bakgrund

Kunder har fått två orderbekräftelser, och ekonomi har hittat dubbla fakturor för
samma order. Betalleverantören skickar om en webhook tills den får ett 2xx-svar,
så samma `payment.succeeded`-event kan komma flera gånger.

## Fråga

Vilka av våra tjänster hanterar `payment.succeeded` idempotent och vilka gör det
inte? Vad rekommenderar ni att vi gör?

## Leverans

Ett underlag som teamet kan fatta beslut på. Ingen kod ska ändras i den här spiken.
