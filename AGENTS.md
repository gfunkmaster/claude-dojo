# AGENTS.md

Claude Dojo: a CLI that grades exercises about using Claude well. TypeScript, strict, ESM, run directly by Node's type stripping (no build step).

## Commands
- `npm test`: all tests (`node:test`). No API key needed; tests use fakes from `test/fakes.ts`.
- `npm run lint`, `npm run typecheck`: must pass before a commit.
- `npm run dojo -- <command>`: run the CLI from the repo.
- `npm run web`: the local web UI (Next.js, `web/`). `npm run web:build` must pass too; CI runs it.

## Rules
- Node >= 22.18. Import local files with the `.ts` extension. Only erasable TypeScript syntax (no enums, no parameter properties, no namespaces).
- Every call to the Anthropic API goes through `LlmClient` (`src/llm/client.ts`), every `claude -p` through `ClaudeCli` (`src/llm/claude-cli.ts`). Never call the SDK or spawn `claude` anywhere else; tests depend on swapping these.
- `LlmClient` has two backends, picked by `DOJO_BACKEND` (`src/llm/backend.ts`): `AnthropicLlmClient` (API) and `ClaudeCliLlmClient` (subscription, via `ClaudeCli.ask`). `tools` and `request` exercises only run on the API.
- `src/core`, `src/runners`, `src/judge`, `src/store` and `src/analyze` must not import from `src/cli`. The web UI (`web/`) imports them directly, through `src/dashboard`. It never writes results or calls a model itself: grading spawns `dojo run` and a hint spawns `dojo hint --json` (`src/dashboard/runner.ts`), and the only files it writes are in an exercise's workspace (`src/dashboard/workspace.ts`). It binds to 127.0.0.1, and every API route calls `refuse()` from `web/lib/data.ts` first; keep both.
- Results are append-only JSON validated by `src/core/result.ts`. Changing that schema means bumping `schemaVersion`.
- The review schedule (`src/core/schedule.ts`) is derived from the results and the hint log (`src/core/help.ts`) by a pure function. Don't give it state of its own; `schedule.json` is only a snapshot for other readers. The on-disk shapes are documented in the README ("Data on disk"), which the web UI relies on: keep them in sync.
- No new dependencies without asking.
- Transcripts (`src/analyze`) are the user's private data. Only redacted excerpts from `detectPatterns` may leave the module, and only to `claude -p` through `ClaudeCli`. Never commit a real transcript or anything in `generated/`; tests use the synthetic fixtures in `test/fixtures/transcripts/`.

## Exercises
- One folder per exercise with `exercise.md` (YAML frontmatter + task text), `starter/` and `refs/good` + `refs/bad`. Schema: `src/core/exercise.ts`.
- Every exercise is picked up by `test/e2e.test.ts` automatically. Teach `test/fakes.ts` how the model or `claude` reacts to its good and bad references, so calibration is tested offline.
- The curriculum needs every skill at every level (difficulty 1-3); a test enforces it.
- Child processes that run `node --test` must use `cleanEnv()` from `src/checks/index.ts`, or they report to the parent test runner and always exit 0.
- Exercise text and `playbooks/` are in Swedish; code, comments and README are in English.
