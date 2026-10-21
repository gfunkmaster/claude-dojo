# ADR 0007: Idempotent webhook handling

Status: Accepted (2025-03-04)

## Decision

Every service that handles payment webhooks records the event id in the
`ProcessedEvent` table before acting on it, and treats a duplicate key as
"already handled". All services follow this pattern.
