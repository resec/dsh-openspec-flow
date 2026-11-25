# Proposal

## Why

A lab run keeps a web session cookie and a startup URL that carries a one-time token. The cookie and URL were stored in the state file and printed by `npm run lab -- inspect`, and a web failure carries the log tail into the report's `error`, which can include the startup line. The lab-harness spec and `docs/lab.md` both promise that reports carry no token, cookie or key.

## What Changes

- Keep the live web handle in the lab closure; publish only `base` and `logPath` to the state.
- Replace credential values in report error text and check details with `<redacted>`.
- Print and persist the state through the same redaction.
- Add unit tests for the text redaction and the state projection.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The spec already requires secrets to stay out of the report; the implementation now matches, so this change sets `skip_specs: true`.

## Impact

- New `scripts/lab/core/redact.mjs`; `scripts/lab/index.mjs`; `scripts/lab/cli.mjs`.
- `test/lab-redact.test.mjs`.
- No DSH version, workflow, hook, coverage-baseline or `dist/` change.
