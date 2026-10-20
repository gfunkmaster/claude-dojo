# Claude Dojo

A CLI that trains you to use the whole Claude ecosystem well: prompting, context (AGENTS.md, memory, skills), tools and MCP, agents, the Claude Code environment (hooks, permissions, headless), the API (caching, cost) and evals.

The loop: pick an exercise, solve it in your workspace, and Dojo runs and grades it. You get a score, an explanation, and a tip for each criterion you missed. Every run is saved, so you can see what you keep getting wrong.

## Requirements

- Node 22.18 or later. TypeScript runs directly through Node's type stripping, so there is no build step.
- `ANTHROPIC_API_KEY` (or an `ant auth login` profile) for prompt and eval exercises and for the judge.
- For env exercises: [Claude Code](https://code.claude.com) installed and signed in, so `claude -p` works.

```sh
npm install
npm link        # optional: puts `dojo` on your PATH
```

Without `npm link`, use `npm run dojo -- <command>`.

## Usage

```sh
dojo next                      # the next exercise on the path that you have not passed
dojo list                      # the whole path, best score, calibration status
dojo run prompt-extract-invoice
#   first time: copies the starter to workspace/<id>/ and prints the task
#   after that: grades what is in workspace/<id>/
dojo run <id> --calibrate      # grade the reference answers to check the exercise itself
dojo run <id> --keep           # env exercises: keep the sandbox for debugging
dojo stats                     # per skill: runs, last and best score, cost, most missed criteria
dojo stats <id>                # history for one exercise
```

`DOJO_HOME` moves `workspace/` and `results/` somewhere else. `DOJO_JUDGE_MODEL` changes the judge model (default `claude-opus-5-5`).

## The path

21 exercises: every skill at three levels. `dojo next` takes you through them in this order, and an exercise counts as passed at 70 or more.

| Skill | Nybörjare | Avancerad | Elit |
| --- | --- | --- | --- |
| prompting | `prompt-extract-invoice`: JSON with null for missing values | `prompting-few-shot-tone`: brand voice through examples | `prompting-injection-resistant`: emails that try to take over the model |
| context | `context-project-commands`: AGENTS.md with the right commands | `context-agents-md`: house rules Claude follows the first time | `context-release-skill`: a skill Claude finds on its own |
| tools | `tools-describe-tools`: descriptions that route to the right tool | `tools-strict-schema`: a schema that forces valid arguments | `tools-mcp-server`: your own MCP server, no dependencies |
| agents | `agents-first-subagent`: a subagent with its own brief and tools | `agents-fan-out-command`: a slash command that fans out to parallel subagents | `agents-planner`: an orchestrator that plans for several agents |
| env | `env-permissions`: deny rules that protect secrets | `env-hook-block-rm`: a PreToolUse hook that stops `rm -rf` | `env-stop-hook`: a Stop hook that waits for green tests |
| api | `api-pick-model`: the cheapest model and settings that work | `api-prompt-caching`: caching that actually hits | `api-structured-output`: guaranteed JSON with a schema |
| evals | `evals-first-eval`: a first eval that catches a broken prompt | `evals-eval-discriminates`: an eval that tells good from broken | `evals-llm-judge`: an LLM judge that catches made-up claims |

## How grading works

1. **Runner.** One per exercise type:
   - `prompt`: your system prompt is sent once per test case.
   - `tools`: your tool definitions are sent with each case. Checks see the first tool call as `{"tool", "input", "text"}`.
   - `request`: your file is a whole Messages API request body, sent once per case in order, so prompt caching works the way it would in production.
   - `env`: a fixture repo plus your files are copied into a temp folder, committed, and `claude -p` runs there. Most env exercises also copy `exercises/_shared/tool-log`, a PostToolUse hook that writes every tool call to `.dojo/tools.log` for the checks.
   - `eval`: your eval runs against hidden prompt variants.
2. **Deterministic checks.** JSON shape, values, regexes, files, shell commands, turn and cost limits.
3. **Judge.** Only runs if at least half the checks pass. A stronger model grades each rubric criterion as `pass`, `partial` or `fail`, writing its reasoning first, through a schema-validated structured response. The rubric is prompt-cached, so reruns are cheap. An invalid verdict is retried once, then reported as an error instead of a made-up grade.
4. **Score.** `100 × (checks weight × share of checks passed + judge weight × weighted judge grade)`. Default weights are 0.5 / 0.5. 70 or more is a pass.

Every exercise ships a known good and a known bad answer. `--calibrate` grades both and fails if either lands outside its expected range. `dojo list` marks an exercise that fails calibration as `UNRELIABLE`.

## Results

Each run is written once to `results/<timestamp>_<id>.json` and never changed. A result holds the score, every check, every criterion with the judge's reasoning, `failedCriteria`, tokens (input, output, cache read, cache write), cost in USD, turns, models and a hash of your solution. The schema is in `src/core/result.ts`.

## Safety of env exercises

Env exercises run `claude -p` in a temp folder with `--permission-mode acceptEdits`, only the tools the exercise allows, and `--setting-sources project,local`, so your personal settings and hooks don't apply. `--max-budget-usd` caps the cost of each run. The hook exercise deliberately allows `Bash` and tries to get Claude to run `rm -rf` inside the sandbox. Read an exercise before you run it.

## Writing a new exercise

An exercise is a folder anywhere under `exercises/`:

```
exercises/<area>/<name>/
  exercise.md      frontmatter + the task text you read
  starter/         copied to workspace/<id>/ on the first run
  refs/good/       a known good solution, laid out like a workspace
  refs/bad/        a known bad solution
  ...              inputs, fixture repo, hidden variants: anything the frontmatter points to
```

`exercise.md` starts with YAML frontmatter. It is validated with zod (`src/core/exercise.ts`), and `dojo list` reports any errors.

```yaml
---
id: prompt-extract-invoice      # unique, kebab-case
title: Extract invoice data
skill: prompting                # prompting | context | tools | agents | env | api | evals
type: prompt                    # prompt | tools | request | env | eval
difficulty: 1                   # 1 nybörjare, 2 avancerad, 3 elit
model: claude-haiku-5-5         # model that runs your solution (prompt, tools and eval)
solution: system.md             # the main file in the workspace
cases:
  - name: Swedish invoice
    input: inputs/01.txt        # or `text:` inline; env cases use `task:`
    checks:
      - { kind: json-valid }
      - { kind: json-path, path: $.total, equals: 1249.5 }
criteria:                       # the judge's rubric; leave empty for checks only
  - { id: no-invented-values, weight: 2, text: Missing values become null, never guessed. }
references:                     # at least one good and one bad
  - { label: good, dir: refs/good, expect: [75, 100] }
  - { label: bad, dir: refs/bad, expect: [0, 50] }
weights: { checks: 0.5, judge: 0.5 }   # optional
---

The task, in markdown.
```

**Checks**

| kind | fields | passes when |
| --- | --- | --- |
| `json-valid` | | the output is JSON (a single code fence is allowed) |
| `json-path` | `path`, `equals` | the value at `$.a.b[0]` equals `equals` (missing is not `null`) |
| `regex` | `pattern`, `flags?`, `negate?` | the output matches |
| `command` | `run`, `exitCode?` | the shell command exits with `exitCode` (default 0) in the sandbox |
| `file-exists` | `path`, `negate?` | the file exists in the sandbox |
| `file-contains` | `path`, `pattern`, `negate?` | the file matches the regex (a missing file never matches) |
| `min-cache-read` | `tokens` | the case read at least this many tokens from the prompt cache (request exercises) |
| `max-turns` | `value` | Claude used at most this many turns |
| `max-cost` | `usd` | the run cost at most this much |

Regexes are JavaScript regexes. Use `flags: "i"` for case-insensitive matching; inline `(?i)` does not work.

**Tools exercises**: the solution is `{"system"?, "tools": [...]}`. Check the call with `json-path` on `$.tool` and `$.input.<field>`; `$.tool` is `null` when the model called no tool.

**Request exercises**: the solution is a Messages API body. `{{input}}` is replaced by the case input and `{{file:path}}` by a file from the exercise folder. Without `messages`, the input is sent as the user turn. The model must be one of the priced models, and `max_tokens` is capped at 16 000.

**Env exercises** add an `env` block. Its fixture folders are copied into the sandbox in order, then your files on top:

```yaml
env:
  fixture: [../../_shared/tool-log, fixture]
  maxTurns: 20
  maxCostUsd: 1
  allowedTools: [Read, Edit, Write, "Bash(npm test:*)"]
```

**Eval exercises** add an `eval` block. Your `solution` file holds `cases:` in the format above. Dojo runs it against each variant and expects good variants to pass every case and broken ones to fail at least one:

```yaml
eval:
  variants:
    - { file: variants/good.md, shouldPass: true }
    - { file: variants/broken.md, shouldPass: false }
```

**Checklist for a new exercise**

1. Write `refs/good` and `refs/bad` before you tune the rubric. A rubric that can't separate them is not finished.
2. Give each criterion one observable thing to judge. Weight the ones that matter most.
3. Run `dojo run <id> --calibrate` against the real API and adjust `expect` ranges or criteria until it passes.
4. Add the exercise to `test/e2e.test.ts` and teach `test/fakes.ts` how to respond, so CI covers it without an API key.

## Development

```sh
npm test           # node:test with a fake model and a fake claude
npm run lint
npm run typecheck
```

Project rules for agents and humans are in [AGENTS.md](AGENTS.md).

## Roadmap

- Phase 2: analyse `~/.claude/projects/**/*.jsonl` transcripts and generate personal exercises into `exercises/generated/` (the `source` field records where each one came from).
- Phase 3: spaced repetition per skill, built on `failedCriteria` in the saved results.
- Phase 4: a Next.js web UI that imports `src/core`, `src/runners`, `src/judge` and `src/store` directly.
