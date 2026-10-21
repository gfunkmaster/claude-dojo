# AGENTS.md

Monorepo for the shop backend. Each folder in `services/` is its own deployable
service (Node, ESM). They share one Postgres database through Prisma; the schema
is in `prisma/schema.prisma`.

- `services/checkout`: carts and orders.
- `services/billing`: invoices.
- `services/notifications`: customer email and SMS.
- `services/search`: product search.

Payment events come from the payment provider as webhooks, fanned out to every
service that subscribes. See `docs/adr/` for past decisions.
