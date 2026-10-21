# AGENTS.md

Plain Node HTTP service, no dependencies. Node's built-in test runner.

## Commands
- `npm test`: runs all tests. Run it after every change.
- `npm run lint`: repo rules below. Must pass before you finish.

## Adding a route
1. Create `src/routes/<name>.js` (kebab-case) exporting `{ method, path, handler }`.
   `handler(req)` returns `{ status, body }`. See `src/routes/users.js`.
2. Register it in the array in `src/routes/index.js`. Unregistered routes are never served.
3. Add `test/routes/<name>.test.js`. Copy the shape of `test/routes/users.test.js`.

## Lint rules
- No `console.log` in `src/`.
- File names in `src/` and `test/` are kebab-case.
- Every file in `src/routes/` except `index.js` needs a matching test file.

## Changelog
Every new route gets a line under `## Unreleased` at the top of `CHANGELOG.md`, right below `# Changelog`: `- Add GET /path`. Create the heading if it is missing. Lint does not check this, so don't skip it.
