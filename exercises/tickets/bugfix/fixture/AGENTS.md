# AGENTS.md

Reports API. Plain Node (ESM), no dependencies, laid out like a NestJS app:
one folder per module in `src/`, with `<module>.service.js` (all logic) and
`<module>.controller.js` (routes only).

## Commands
- `npm test`: all tests. Run after every change.
- `npm run lint`: repo rules below. Must pass before you are done.

## Rules
- Dates in the API are `YYYY-MM-DD` and mean whole days in UTC.
- Throw the error classes in `src/common/errors.js`. Never `throw new Error`.
- Services take their dependencies in the constructor; tests pass fakes.
- Tests: `test/<module>.<topic>.test.js`, with `node:test` and `node:assert/strict`.
- No `console.log` in `src/`.
