# Design: real-model e2e evaluation harness

## Context

See [proposal.md](proposal.md) for motivation and the evaluation-harness spec for the contract.

Phase 0 established these facts, which shape the design:

- `dsh --profile headless` runs one task per process; a new session cannot be named, while an existing session can be resumed with `--session-id`. A full flow therefore needs several processes and one session.
- Provider usage is recorded per `assistant/message` in the session log (uncached input, cache reads, cache writes, output). The `--json` stream also carries usage on `status.step_end`, but tool-result strings are capped at 8 KiB.
- The plugin adds about 2.4k tokens of fixed overhead per request (13 tool schemas plus the scoped policy), so a single read-only step is not a useful comparison; the apply loop is.
- `dsh` writes `~/.dsh/profiles/headless/cordis.yml` and `~/.dsh/sessions` on every run, so the harness needs full file access and cannot run under a workspace-write tool sandbox.
- The baseline arm needs an `openspec` 1.16.0 shim on `PATH`; the plugin arm resolves its own copy and ignores `PATH`.

## Goals / Non-Goals

**Goals**

- One reproducible command that prepares fixtures, runs both arms, verifies correctness and writes a report.
- A flow driver that can survive the known confirmation gates without a human in the loop.
- Metrics that are auditable from retained artifacts, not estimated from bytes.

**Non-Goals**

- No change to plugin runtime behavior, tools, skills or policy.
- No CI integration and no automatic real-model spend.
- No automatic conclusion below the configured sample size.
- No upstream OpenSpec fixture in the first iteration; the fixture registry is extensible.

## Decisions

### One session, resumed at each gate

A run starts one headless process with the initial request. The harness records the session id from the `session` event and resumes that id for later rounds. Each round is a separate process, so a crash loses only one round.

Stage detection reads the fixture, not the assistant text: no change directory means the creation gate; a change with unchecked tasks means the apply gate; all tasks checked without an archive means the archive gate; an archive means done. This keeps the driver independent of phrasing and of which arm is running.

Alternative considered: one long prompt that pre-authorizes every gate. Rejected because the skills explicitly require confirmation, and a pre-authorized prompt would stop exercising the gate behavior the user wants measured.

### Confirmation rounds are marked, not hidden

Every round records `kind: initial | confirmation | work`. Expected confirmations are excluded from the unexpected-intervention count. Token totals include every round; the report also shows `tokensWithoutConfirmationRounds`, computed by subtracting rounds triggered by a confirmation message. This gives the user both views without silently discarding real spend.

### Fixtures are prepared from pinned sources

The synthetic fixture is a small Node project stored in `eval/fixtures/budget-cli/` with a feature request and hidden acceptance. Real fixtures are manifests pinning a base commit and a reference commit in this repository; preparation uses `git archive <base>` so the target change is absent, then initializes a fresh repository with a fixed author and date.

Hidden acceptance is never present while the model works. After the run, the harness copies the acceptance tests into the fixture and runs them. For the policy fixture the hidden test is `test/policy.test.mjs` from the reference commit; for the skill fixture it is the reference `test/skills.test.mjs`. The request text states the module API or file locations the hidden test relies on, so the test checks behavior rather than guessing an interface.

The real fixtures need the pinned `@fission-ai/openspec` dependency. Preparation symlinks the plugin repository's `node_modules` into the fixture instead of installing dependencies per run; the CLI is already pinned there.

### Arm setup is a patch, not a second profile

The `headless` profile carries the plugin bundle so the plugin arm is the default. The official arm passes `plugin-off.yml`, which sets `disabled: true` on `openspec-flow`. Both arms pass `no-subagents.yml`; web tools stay mounted.

Official skills are generated once per fixture with the pinned CLI (`init --tools dsh`) and cached under `eval/.cache/official-skills/`. Plugin skills come from the current plugin package, except for the skill-command-maps fixture, whose manifest sets `skillSource: fixture`: its packaged skills are the pre-change text, and installing the current package skills would leak the answer. That fixture is the documented exception, not the default.

### Session log is the metric source of record

The runner captures both the `--json` event stream and the persisted session log. Usage, tool calls, result bytes, retries and compactions are read from the log with Node's `zlib.zstdDecompressSync`; the JSON stream is used for live round boundaries and failure messages. A round whose log shows no usage is incomplete and fails the token gate.

### Verification gates stop invalid savings

A run is valid only if the fixture test suite, hidden acceptance, `openspec validate --strict`, all task checkboxes and the archive succeed. Failed runs stay in the report with their gate result; they are never dropped. The report shows both intention-to-treat (all runs) and per-protocol (valid runs).

### Statistics are descriptive at this sample size

Default `n = 5` per arm, interleaved ABBA. The report shows every run, medians with interquartile ranges, ratios and a bootstrap confidence interval. A difference smaller than within-arm spread is labelled indistinguishable. No single run is treated as evidence.

### Offline tests inject the runner

`run.mjs` depends on a `runRound` function. Tests pass a fake implementation returning recorded event and session fixtures, so `node --test test/` exercises the state machine, metrics and report without `dsh` or provider access.

## Risks / Trade-offs

- **Plan variability in full flow** → the correctness gates and fixture request text constrain the outcome; token differences from different plans are reported as a separate observation, not hidden.
- **Confirmation spend is real** → report both totals; never subtract silently.
- **Hidden tests couple to stated APIs** → the request states the API or paths the hidden test uses; the policy fixture uses the reference unit test, so the interface is explicit.
- **`node_modules` symlink is host-specific** → preparation fails loudly if the plugin repository has no installed CLI; the README documents `npm install`.
- **Real fixture base commits could be rewritten** → manifests pin full commit hashes; preparation verifies `git cat-file -e`.
- **Provider/cache drift** → record model, effort, date and cache splits; interleave arms; keep raw logs.
- **Synthetic fixture may be unrepresentative** → the two real fixtures from this repository's own history balance it; an upstream fixture is a later extension.

## Migration Plan

1. Create the `headless` profile and restore credentials (documented in `eval/README.md`).
2. Install the plugin bundle into the profile; official runs use `plugin-off.yml`.
3. No runtime migration and no data migration. Removing `eval/runs/` and the profile changes rolls back the harness.

## Open Questions

- Which upstream OpenSpec change should become the third real fixture once the harness is stable?
- Should the cost report use a static price table or the provider invoice? The harness ships without prices and reports token categories first.
