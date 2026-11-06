# Tasks

## 1. Harness foundation

- [x] 1.1 Create the `eval/` skeleton with `run.mjs`, `lib/config.mjs` and `lib/paths.mjs`, and verify `node eval/run.mjs --help` exits 0 and lists `--fixture`, `--arms`, `--runs` and `--execute`.
- [x] 1.2 Add `eval:dry` and `eval:pilot` scripts plus `eval/runs/` and `eval/.cache/` ignore entries, and verify `npm run eval:dry` prints the planned matrix without starting a model call.

## 2. Session metrics

- [x] 2.1 Implement `lib/session.mjs` to read a `.zstd` session log and expose usage, prompts, tool calls, result bytes, skills, retries, compactions and duration, and verify `node --test test/eval-session.test.mjs` passes on the checked-in sample log.
- [x] 2.2 Implement `lib/metrics.mjs` to compute per-round usage, the confirmation split, the friction vector and arm aggregates, and verify tests cover totals, missing usage and confirmation subtraction.

## 3. Flow driver

- [x] 3.1 Implement `lib/flow.mjs` stage detection from fixture state plus the confirmation script, and verify tests cover create, apply, archive, skipped gate and stalled run.
- [x] 3.2 Implement `lib/runner.mjs` to spawn a round, capture NDJSON, enforce a timeout, resume the same session and record aborts, and verify a fake `dsh` test produces two rounds and kills a hanging round.

## 4. Arms and profile

- [x] 4.1 Add `eval/patches/plugin-off.yml`, `plugin-on.yml` and `no-subagents.yml`, and verify `lib/profile.mjs` accepts the three patches against a recorded `--dump-config` export.
- [x] 4.2 Implement `lib/profile.mjs` preflight for the plugin row, subagent rows, model and effort, PATH shim and tool surface, and verify tests accept a matching header and reject a drifted one.

## 5. Fixtures

- [x] 5.1 Build the synthetic `budget-cli` fixture with app code, existing tests, `request.md`, confirmations and hidden acceptance, and verify `node --test` passes in the fixture and the request names the acceptance API.
- [x] 5.2 Implement `lib/fixtures.mjs` to copy the synthetic fixture, extract a real base with `git archive`, initialize a fixed commit, symlink `node_modules` and install skills per arm, and verify tests reject a manifest whose target change is already present.
- [x] 5.3 Add the `policy-rule` real fixture manifest pinned to base `14dada0` and reference `3f30caf`, and verify preparation has no `lib/policy.js` and no hidden acceptance before verification.
- [x] 5.4 Add the `skill-command-maps` real fixture manifest pinned to base `4a3b507` and reference `6fd4df3` with `skillSource: fixture`, and verify preparation still contains `## Command map` and hides the acceptance test.

## 6. Verification and report

- [x] 6.1 Implement `lib/verify.mjs` gates for fixture tests, hidden acceptance, strict validation, checked tasks and archive, and verify tests pass and fail each gate in a temporary fixture.
- [x] 6.2 Implement `lib/report.mjs` to write per-run JSON and a Markdown report with medians, ratios, an indistinguishable label and artifact paths, and verify tests assert each section.
- [x] 6.3 Implement the `run.mjs` matrix with ABBA order, budget and timeout guards, confirmation rounds and artifact layout, and verify a fake-runner dry execution writes a complete report.

## 7. Documentation and validation

- [x] 7.1 Write `eval/README.md` and update `README.md` and `AGENTS.md` with the headless profile assumptions, command examples, manual-trigger rule and cleanup, and verify the documented commands match the scripts.
- [x] 7.2 Run `openspec_validate add-model-e2e-eval` and `npm run test:eval`, and verify both pass.
