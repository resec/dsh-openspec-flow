# Proposal

## Why

The lab command line parsed every `--flag` the same way: the next token became its value unless that token also began with `--`. The consumers of `--offline`, `--fresh-dsh`, `--mock-only`, `--include-real-model`, `--cleanup`, `--keep` and `--all` compare with `=== true`, so `lab test --offline test/lab/install-smoke.scenario.mjs` produced `flags.offline === 'test/lab/install-smoke.scenario.mjs'` and an empty positional list. The switch was ignored and the run fell back to every discovered scenario in online mode, without any message. `npm run test:lab -- --keep a.scenario.mjs` did the same.

## What Changes

- Parse a known value flag (`--name`, `--mode`, `--plugin`, and `--keep` for `cache prune`) with a value, and every other flag as a boolean switch whose following token stays a positional argument.
- Guard the switch and value cases in `test/lab-cli.test.mjs`.
- State the rule in `docs/lab.md` and guard the sentence in `test/lab-doc.test.mjs`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. `lab-harness` names these options as standalone switches (`--fresh-dsh`, `--offline`, `--include-real-model`, `--mock-only`, `--cleanup`, `--keep`); the parser did not honor that reading, so this change sets `skip_specs: true`.

## Impact

- `scripts/lab/cli.mjs`: `parseOptions` and its one call site.
- `test/lab-cli.test.mjs`: three parser cases.
- `docs/lab.md`: one paragraph in the commands section; `test/lab-doc.test.mjs` guards it.
- No cache, install, doctor, report or workflow change.
