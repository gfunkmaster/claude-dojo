# DOJO-142: Kundtjänst ska kunna avbryta en order

**Typ:** Story · **Prioritet:** Medium · **Komponent:** orders · **Rapportör:** Sara (kundtjänst)

## Bakgrund

Kunder ringer och vill avbryta en beställning innan den har skickats. I dag måste
kundtjänst be en utvecklare ändra statusen direkt i databasen, vilket tar tid och
inte lämnar något spår av varför ordern avbröts.

## Acceptanskriterier

1. `OrdersService.cancel(id, reason)` avbryter en order som har status `pending` eller `paid`.
2. En avbruten order får `status: "cancelled"`, `cancelledAt` (tjänstens klocka) och `cancelReason`.
3. En order med status `shipped` eller `cancelled` går inte att avbryta: `OrderStateError` (409).
4. `reason` krävs och måste vara minst 3 tecken efter trim, annars `ValidationError` (400).
5. `POST /orders/:id/cancel` med body `{ "reason": "..." }` svarar 200 med den avbrutna ordern.
6. Okänt id ger 404, som övriga endpoints.

## Utanför scope

Återbetalning av betalda ordrar hanteras i DOJO-150.
