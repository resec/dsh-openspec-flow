# Proposal

## Why

When the lab cannot initialize an isolated profile, `ensureProfile` builds its error from the last 1,500 characters of the child output. DSH prints the cause of a boot failure on its first line, so the reported message begins mid-word — a real macOS run surfaced `could not initialize verify-headless: nitializeProfileFromDefault (...)` — and the actionable part (which step failed, on which path) is gone. The failure is still visible in the run directory, but the one-line error a caller reads first points at the wrong thing.

## What Changes

- Bound the profile-initialization output by keeping its head and its tail instead of only its tail, so the first line that names the cause survives truncation. Surrounding whitespace is dropped and a marker shows the omitted middle.
- Write the untouched output under the run directory and name that file in the failure, so the bounded message never becomes the only copy.
- Extract the bounding and the message into pure helpers in `scripts/lab/core/process.mjs` so both are unit-testable without Chromium, DSH or a network.
- Add regression tests that fail on the current tail-only behaviour.

Out of scope: the report schema, the scenario format, doctor checks, the plugin runtime and any other lab error message.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `lab-harness`: adds a requirement that a profile-initialization failure carries the head and the tail of the command output within a bounded length, drops surrounding whitespace, and keeps the untouched output in the run directory. Scenarios cover an over-long output, an output within the budget, the bound, and the kept output file.

## Impact

- `scripts/lab/index.mjs`: the `ensureProfile` failure path writes the untouched output to `<run>/artifacts/init-<mode>.log` and builds its message with the formatter.
- `scripts/lab/core/process.mjs`: new exported helper and limit constant.
- `test/lab-process.test.mjs`: new regression tests.
- No plugin runtime change, no dependency change, no change to the packaged tarball, `dist/`, hooks or workflows.
