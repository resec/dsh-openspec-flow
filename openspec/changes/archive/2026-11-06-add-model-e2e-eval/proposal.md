# Add a real-model e2e evaluation harness

## Why

The plugin's efficiency claims are expressed in bytes, not provider tokens. No repository command can run the official OpenSpec skills plus CLI and this plugin over the same change with the same model, so token savings, workflow friction and correctness cannot be verified end to end.

## What Changes

- Add a manually triggered `eval/` harness that drives `dsh --profile headless` for two arms: official skills + CLI, and this plugin with migrated skills.
- Drive the full flow as one session with scripted confirmation rounds: initial request, confirmation before creating the change, confirmation before apply, and an archive request. Record every confirmation round and report tokens both with and without those rounds.
- Ship one synthetic fixture and two real fixtures reconstructed from this repository's git history: `add-scoped-flow-policy` and `remove-skill-command-maps`. Hidden acceptance tests are injected only after a run.
- Extract provider usage per request, first and peak prompt size, tool calls, CLI calls, result bytes, retries, compactions and wall time from the session log.
- Gate correctness on the fixture test suite, hidden acceptance, `openspec validate --strict`, checked tasks and the archived change; failed runs are retained and marked invalid.
- Generate a per-run JSON record and a Markdown report with per-run rows plus aggregate medians and ratios.
- Keep the harness offline-testable with a fake runner; real model calls are manual, bounded by a timeout and a run budget, with subagents disabled and web tools left enabled.

## Capabilities

**New Capabilities**

- `evaluation-harness`: the real-model two-arm evaluation contract, fixtures, metrics, correctness gates and reporting.

**Modified Capabilities**

- None. The plugin's runtime tools, skills and policy are unchanged.

## Impact

- New: `eval/` harness, fixtures, patches and report templates; `test/eval-*.test.mjs` offline tests.
- Changed: `package.json` scripts, `README.md`, `AGENTS.md` (usage and safety notes).
- Not changed: `lib/`, `index.js`, packaged skills and the OpenSpec CLI dependency.
- Environment: requires the `headless` profile with stored credentials and the plugin bundle; real runs cost provider tokens and are never part of CI.
