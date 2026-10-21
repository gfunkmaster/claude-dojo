# AGENTS.md

Claude Dojo: a CLI that grades exercises about using Claude well. TypeScript, strict, ESM, run directly by Node's type stripping (no build step).

## Commands
- `npm test`: all tests (`node:test`). No API key needed; tests use fakes from `test/fakes.ts`.
- `npm run lint`, `npm run typecheck`: must pass before a commit.
- `npm run dojo -- <command>`: run the CLI from the repo.

## Rules
- Node >= 22.18. Import local files with the `.ts` extension. Only erasable TypeScript syntax (no enums, no parameter properties, no namespaces).
- Every call to the Anthropic API goes through `LlmClient` (`src/llm/client.ts`), every `claude -p` through `ClaudeCli` (`src/llm/claude-cli.ts`). Never call the SDK or spawn `claude` anywhere else; tests depend on swapping these.
- `LlmClient` has two backends, picked by `DOJO_BACKEND` (`src/llm/backend.ts`): `AnthropicLlmClient` (API) and `ClaudeCliLlmClient` (subscription, via `ClaudeCli.ask`). `tools` and `request` exercises only run on the API.
- `src/core`, `src/runners`, `src/judge` and `src/store` must not import from `src/cli`. A future web UI will import them directly.
- Results are append-only JSON validated by `src/core/result.ts`. Changing that schema means bumping `schemaVersion`.
- No new dependencies without asking.

## Exercises
- One folder per exercise with `exercise.md` (YAML frontmatter + task text), `starter/` and `refs/good` + `refs/bad`. Schema: `src/core/exercise.ts`.
- Every exercise is picked up by `test/e2e.test.ts` automatically. Teach `test/fakes.ts` how the model or `claude` reacts to its good and bad references, so calibration is tested offline.
- The curriculum needs every skill at every level (difficulty 1-3); a test enforces it.
- Child processes that run `node --test` must use `cleanEnv()` from `src/checks/index.ts`, or they report to the parent test runner and always exit 0.
- Exercise text is in Swedish; code, comments and README are in English.
