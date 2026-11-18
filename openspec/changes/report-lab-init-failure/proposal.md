# Proposal

## Why

When the lab cannot initialize an isolated profile, `ensureProfile` builds its error from the last 1,500 characters of the child output. DSH prints the cause of a boot failure on its first line, so the reported message begins mid-word — a real macOS run surfaced `could not initialize verify-headless: nitializeProfileFromDefault (...)` — and the actionable part (which step failed, on which path) is gone. The failure is still visible in the run directory, but the one-line error a caller reads first points at the wrong thing.

## What Changes

- Bound the profile-initialization output by keeping its head and its tail instead of only its tail, so the first line that names the cause survives truncation.
- Extract that bounding into a pure helper in `scripts/lab/core/process.mjs` so it is unit-testable without Chromium, DSH or a network.
- Add regression tests that fail on the current tail-only behaviour.

Out of scope: the report schema, the scenario format, doctor checks, the plugin runtime and any other lab error message.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `lab-harness`: adds a requirement that a profile-initialization failure reports the cause from the start of the child output within a bounded length, with a scenario for an over-long output and one for a short output.

## Impact

- `scripts/lab/index.mjs`: the `ensureProfile` failure path uses the helper.
- `scripts/lab/core/process.mjs`: new exported helper and limit constant.
- `test/lab-process.test.mjs`: new regression tests.
- No plugin runtime change, no dependency change, no change to the packaged tarball, `dist/`, hooks or workflows.
