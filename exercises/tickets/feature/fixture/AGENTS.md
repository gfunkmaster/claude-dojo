# AGENTS.md

Orders API. Plain Node (ESM), no dependencies, laid out like a NestJS app:
one folder per module in `src/`, with `<module>.service.js` (all logic) and
`<module>.controller.js` (routes only). `src/app.js` wires them together.

## Commands
- `npm test`: all tests. Run after every change.
- `npm run lint`: repo rules below. Must pass before you are done.

## Rules
- Throw the error classes in `src/common/errors.js` (`NotFoundError`, `ValidationError`, `OrderStateError`). Never `throw new Error`: `src/app.js` maps the classes to HTTP status codes, anything else becomes a 500.
- Services take a clock (`() => Date`) in the constructor. Never call `new Date()` directly in a service, or tests can't pin time.
- Controllers map a request to one service call. No logic in them.
- Tests: `test/<module>.<topic>.test.js`, with `node:test` and `node:assert/strict`.
- No `console.log` in `src/`.
