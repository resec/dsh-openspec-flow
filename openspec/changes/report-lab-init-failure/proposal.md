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

- `lab-harness`: adds two requirements. The first covers the message: both ends of the output within a bounded length, surrounding whitespace dropped, and a summary only when it shortens the output. The second covers the kept output: written under the run directory and named in the failure, with a rejected write leaving the diagnosis intact. Scenarios cover an over-long output, an output within the budget, an output the summary would not shorten, the bound, the kept file and a rejected write.

## Impact

- `scripts/lab/index.mjs`: the `ensureProfile` failure path delegates to `recordProfileInitFailure`.
- `scripts/lab/core/process.mjs`: the summary helper, the head constant and the message builder.
- `scripts/lab/core/profile-init.mjs`: writes the untouched output into the run artifacts and degrades when the write is rejected.
- `test/lab-process.test.mjs`, `test/lab-profile-init.test.mjs`: the regression tests for the summary and for the write.
- `docs/lab.md`: the artifact list names `init-<mode>.log`.
- No plugin runtime change, no dependency change, no change to the packaged tarball, `dist/`, hooks or workflows.
