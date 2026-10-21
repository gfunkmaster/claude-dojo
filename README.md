# Claude Dojo

A CLI that trains you to use the whole Claude ecosystem well: prompting, context (AGENTS.md, memory, skills), tools and MCP, agents, the Claude Code environment (hooks, permissions, headless), the API (caching, cost) and evals.

The loop: pick an exercise, solve it in your workspace, and Dojo runs and grades it. You get a score, an explanation, and a tip for each criterion you missed. Every run is saved, so you can see what you keep getting wrong.

## Requirements

- Node 22.18 or later. TypeScript runs directly through Node's type stripping, so there is no build step.
- [Claude Code](https://code.claude.com) installed and signed in, so `claude -p` works. With a Claude subscription that is all you need for 16 of the 21 exercises (see [Backends](#backends)).
- Optional: `ANTHROPIC_API_KEY` for the 5 `tools` and `request` exercises, which send raw Messages API requests.

```sh
npm install
npm link        # optional: puts `dojo` on your PATH
```

Without `npm link`, use `npm run dojo -- <command>`.

## Usage

```sh
dojo next                      # a review that is due, or else the next exercise on the path
dojo review                    # everything due for repetition, and what you missed last time
dojo list                      # the whole path, best score, calibration status
dojo run prompt-extract-invoice
#   first time: copies the starter to workspace/<id>/ and prints the task
#   after that: grades what is in workspace/<id>/
dojo run <id> --calibrate      # grade the reference answers to check the exercise itself
dojo run <id> --keep           # env exercises: keep the sandbox for debugging
dojo run <id> --fresh          # move your old solution aside and start over from the starter
dojo stats                     # per skill: mastery, trend, due reviews, cost, most missed criteria
dojo stats <id>                # history for one exercise
dojo analyze                   # patterns in your own Claude Code sessions (local only)
dojo analyze --generate        # draft personal exercises from them with your claude -p
```

## Backends

Prompt and eval exercises and the judge need model calls. `DOJO_BACKEND` picks where they go:

| `DOJO_BACKEND` | Model calls go through | Billing |
| --- | --- | --- |
| `claude-cli` | `claude -p`, signed in with your Claude subscription | your subscription |
| `api` | the Anthropic API with `ANTHROPIC_API_KEY` | API credits, per token |

Unset, Dojo uses `api` when `ANTHROPIC_API_KEY` is set and `claude-cli` otherwise. If you sign in to the API with an `ant auth login` profile instead of a key, set `DOJO_BACKEND=api`.

On `claude-cli`:

- Each call is one turn with no tools, run in an empty temp folder, with your system prompt in place of Claude Code's (`--system-prompt-file`), `--tools ""`, no MCP servers, no slash commands, and your CLAUDE.md files and auto memory turned off. Claude Code still adds a little environment context (about 1 500 tokens), so a prompt can behave slightly differently than on the API. Calibrate on the backend you train on.
- The judge uses `--json-schema` and `--effort medium`, and its verdict is still validated with zod and retried once.
- `ANTHROPIC_API_KEY` is removed from the environment of every `claude` Dojo starts, env exercises included, so nothing is billed to the API by accident.
- Tokens come from Claude Code's JSON output. The cost Dojo prints and saves is the API list price for those tokens, for comparison; your subscription covers it, within its usage limits.
- `tools` and `request` exercises need the API, since they are about the request itself (tool definitions, `cache_control`, `max_tokens`, effort). `dojo run` says so, and `dojo next` skips them.

`DOJO_HOME` moves `workspace/`, `results/`, `generated/` and `schedule.json` somewhere else. `DOJO_JUDGE_MODEL` changes the judge model and `DOJO_ANALYZE_MODEL` the model `dojo analyze --generate` uses (both default to `claude-opus-5-5`).

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

## Personal exercises from your sessions

`dojo analyze` reads the transcripts Claude Code keeps in `~/.claude/projects/**/*.jsonl` (or `$CLAUDE_CONFIG_DIR/projects`) and looks for the moments a session went wrong:

| Pattern | Found when | Trains |
| --- | --- | --- |
| `correction` | a prompt opens with "nej", "fel", "no", "wrong", or says "jag sa", "I said", "du glömde", "doesn't work", … right after Claude answered | prompting, context |
| `repeat` | a prompt is mostly the same words as an earlier one in the session | context, prompting |
| `interrupt` | you pressed Esc or rejected a tool call | env, prompting |
| `retry-loop` | 3 or more tool calls failed in a row | env, tools |
| `rework` | one file was edited 6 or more times in a session | evals, prompting |
| `context-bloat` | the context passed 150k tokens, was compacted, or one tool result was over 50k characters | context, agents |

```sh
dojo analyze                          # sessions changed in the last 30 days
dojo analyze --days 0 --project shop  # all time, only projects whose folder name contains "shop"
dojo analyze --generate --max 3       # also draft up to 3 exercises
```

Without `--generate` nothing leaves your machine: the heuristics are plain code, and the report shows short redacted excerpts. With `--generate`, Dojo sends the redacted excerpts of the findings (never whole transcripts or tool output, at most about 24 000 characters) to your local `claude -p`, whatever `DOJO_BACKEND` says. One call summarises the patterns and picks the skill and level that would have prevented each one. Then one call per pattern drafts an exercise in the normal format, with real exercises as format examples. Each draft is checked before it is written: safe paths only, the frontmatter must validate, every file it points to must exist, and the type must be `prompt`, `env` or `eval`, so it runs on a subscription. An invalid draft is sent back once with the error.

Generated exercises go to `generated/<id>/` (ids start with `my-`, and `source` says which pattern they came from). Secrets, emails and home folders are redacted in every file again before it is written. `generated/` is in `.gitignore`, because it is built from your own work; keep it out of git. `dojo list`, `dojo next` and `dojo run` treat generated exercises like the bundled ones. They are drafts, so run `dojo run <id> --calibrate` first and fix or delete any that don't calibrate.

The transcript format is internal to Claude Code and changes between versions. The parser reads a few stable fields and skips lines it doesn't understand, so a new version can make it miss things but should not make it crash.

## Spaced repetition

Every exercise you have run once is on a review schedule, so the ones you failed come back and the ones you passed come back later to check they stuck. It is a [Leitner system](https://en.wikipedia.org/wiki/Leitner_system) with five boxes:

| Box | Comes back after |
| --- | --- |
| 1 | 1 day |
| 2 | 3 days |
| 3 | 7 days |
| 4 | 14 days |
| 5 | 30 days |

After each graded run:

- **Fail** (under 70): back to box 1, so it is due tomorrow.
- **Shaky pass** (70 to 84): stays in its box (box 1 if it was new).
- **Solid pass** (85 or more): up one box. A new exercise you pass solidly starts in box 2.
- A pass **before** the exercise is due doesn't move it. Fixing a failed exercise the same day is good, but it still comes back tomorrow.

`dojo review` lists what is due, failed ones first and then the most overdue, with the criteria you missed last time. `dojo next` shows a due review before any new exercise. To review a failed exercise, keep working in its workspace. To review one you passed, use `dojo run <id> --fresh`: it renames your old solution to `workspace/<id>.old-<timestamp>/` (nothing is deleted) and gives you the starter again, so you solve it from memory instead of regrading the same files.

`dojo stats` shows, per skill, `MASTERY` (the mean of your latest score on each exercise you have run, so it drops when a review goes badly), `TREND` (the mean of your last runs minus the mean of the runs before them, up to 3 against 3), the last 8 scores as a sparkline, how many reviews are due, and your two weakest skills.

Generated exercises are scheduled like the bundled ones. If you delete one, its runs stay in `results/` but it drops out of the review list. Exercises that need API credits are left out of `dojo review` and `dojo next` on a subscription, with a note.

The schedule is computed from `results/` every time: the same runs always give the same schedule, and there is no state to lose. Deleting a result file changes the schedule; nothing else does.

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

## Data on disk

Everything lives under `DOJO_HOME` (default: the repo), and all of it is in `.gitignore`. The web UI and other tools can read it, or better, import the functions below, which don't depend on `src/cli`.

| Path | What | Written | Schema |
| --- | --- | --- | --- |
| `results/<timestamp>_<id>.json` | one graded run | once, never changed | `RunResultSchema` in `src/core/result.ts` |
| `results/calibration/<id>.json` | the latest calibration of an exercise | replaced on each `--calibrate` | `CalibrationSchema` in `src/core/result.ts` |
| `schedule.json` | snapshot of the review schedule | rewritten by `dojo run`, `dojo review` and `dojo next` | `ScheduleSchema` in `src/core/schedule.ts` |
| `workspace/<id>/` | your solution | by you | the exercise's files |
| `generated/<id>/` | your personal exercises | `dojo analyze --generate` | an exercise folder |

`<timestamp>` is `startedAt` with `:` and `.` replaced by `-`, so the file names sort by time.

**A result** (`schemaVersion: 1`):

```jsonc
{
  "schemaVersion": 1,
  "exerciseId": "prompt-extract-invoice",
  "skill": "prompting",          // one of the 7 skills
  "type": "prompt",              // prompt | tools | request | env | eval
  "startedAt": "2026-10-21T17:00:00.000Z",
  "durationMs": 8123,
  "score": 82,                   // 0..100
  "passed": true,                // score >= 70
  "checkScore": 1,               // 0..1
  "judgeScore": 0.64,            // 0..1, null when the judge didn't run
  "judgeNote": "…",              // optional
  "cases": [{ "name": "…", "checks": [{ "check": "…", "passed": true, "detail": "" }] }],
  "criteria": [{ "id": "no-invented-values", "weight": 2, "grade": "partial", "reasoning": "…", "tip": "…" }],
  "failedCriteria": ["no-invented-values"],   // criteria that were not a pass
  "summary": "…",
  "tokens": { "input": 1200, "output": 300, "cacheRead": 0, "cacheWrite": 0 },
  "costUsd": 0.0123,             // API list price, also on a subscription
  "turns": 1,
  "models": ["claude-haiku-5-5", "claude-opus-5-5"],
  "solutionHash": "…"
}
```

**The schedule** (`schemaVersion: 1`). It stores when each exercise is due, not whether it is due, so it doesn't go stale as time passes; compare `dueAt` with the current time. `results/` is the source of truth and `schedule.json` is only a convenience copy, so prefer computing it:

```jsonc
{
  "schemaVersion": 1,
  "generatedAt": "2026-10-21T17:00:00.000Z",
  "entries": [
    {
      "exerciseId": "env-permissions",
      "skill": "env",
      "box": 1,                  // 1..5
      "dueAt": "2026-10-22T17:00:00.000Z",
      "lastRunAt": "2026-10-21T17:00:00.000Z",
      "lastScore": 35,
      "lastPassed": false,
      "missed": ["deny-env"],    // failedCriteria of the last run
      "runs": 1,
      "fails": 1
    }
  ]
}
```

Entries can include exercises that no longer exist (a deleted generated draft); match them against the loaded exercises.

**Functions to import** (no `src/cli` dependencies):

```ts
import { JsonResultStore } from "./src/store/json-store.ts";
import { buildSchedule, dueEntries, upcomingEntries } from "./src/core/schedule.ts";
import { skillProgress, weakestSkills } from "./src/core/progress.ts";
import { readSchedule } from "./src/store/schedule-file.ts";

const runs = await new JsonResultStore(`${home}/results`).listRuns();
const schedule = buildSchedule(runs);           // ScheduleEntry[], soonest first
const due = dueEntries(schedule, new Date());   // failed first, then most overdue
const skills = skillProgress(runs);             // per skill: runs, mastery, trend, recent, costUsd, mostMissed
const weakest = weakestSkills(skills, 2);
const snapshot = await readSchedule(`${home}/schedule.json`);  // Schedule | null
```

Changing the shape of a result or the schedule means bumping its `schemaVersion`.

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
3. Run `dojo run <id> --calibrate` against a real model (either backend) and adjust `expect` ranges or criteria until it passes.
4. Add the exercise to `test/e2e.test.ts` and teach `test/fakes.ts` how to respond, so CI covers it without an API key.

## Development

```sh
npm test           # node:test with a fake model and a fake claude, on both backends
npm run lint
npm run typecheck  # the CLI and the web UI
npm run web:build  # what CI runs to check the UI compiles
```

Project rules for agents and humans are in [AGENTS.md](AGENTS.md).

## Roadmap

- Phase 2: done, see [Personal exercises from your sessions](#personal-exercises-from-your-sessions).
- Phase 3: done, see [Spaced repetition](#spaced-repetition).
- Phase 4: a Next.js web UI that imports `src/core`, `src/runners`, `src/judge` and `src/store` directly.
