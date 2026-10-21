# DOJO-217: Rapporten "Ordrar per dag" visar 0 för sista dagen

**Typ:** Bugg · **Prioritet:** Hög · **Komponent:** reports · **Rapportör:** Johan (ekonomi)

## Beskrivning

När jag tar ut veckorapporten blir sista dagen alltid 0, fast vi vet att det kom in
ordrar den dagen. Ibland ser siffrorna rätt ut om jag laddar om sidan en stund senare,
så det kanske är cachen?

## Steg för att återskapa

1. `GET /reports/orders-per-day?from=2026-10-01&to=2026-10-07`
2. Titta på raden för `2026-10-07`.

**Förväntat:** antalet ordrar som skapades 7 oktober (UTC). Båda datumen är inklusive.
**Faktiskt:** `{ "date": "2026-10-07", "count": 0 }`.

## Övrigt

Intäktsrapporten för samma period verkar stämma.
