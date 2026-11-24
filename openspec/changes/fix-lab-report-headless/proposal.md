# Proposal

## Why

The `lab-harness` spec makes the report the evidence for a run: a headless run must record its exit status and final reason, and a failing run must keep its full run directory. The headless check recorded only `{ name, status, evidence }`, so a failed headless run showed no exit code and no final reason. `runScenarios` recorded `runDir` for a scenario failure but not for a provisioning failure, so the kept scene behind `.cache/lab/reports/<id>.json` could not be found from the summary.

## What Changes

- Build the headless check with `exitStatus` from the driver result and `finalReason` from its final event, through one exported helper.
- Attach the run directory to a provisioning error in `createLab`, and record it as `runDir` in the failed summary result.
- Extend the headless and runner unit tests, and state both fields in `docs/lab.md`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The `lab-harness` spec already requires the exit status and final reason in the report and a kept directory for a failing run; only the implementation fell short, so this change sets `skip_specs: true`.

## Impact

- `scripts/lab/index.mjs`: the headless check, the provisioning error and the summary result.
- `test/lab-headless.test.mjs`, `test/lab-runner.test.mjs`: new assertions.
- `docs/lab.md`, `test/lab-doc.test.mjs`: the report and summary fields.
- No change to existing report fields, token redaction, dependencies, workflows, hooks or `dist/`.
