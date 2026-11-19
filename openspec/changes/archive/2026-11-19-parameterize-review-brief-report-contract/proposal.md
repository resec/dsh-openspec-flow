# Proposal: parameterize-review-brief-report-contract

## Why

The apply brief tells the reviewer what to submit but not what a valid report looks like: its `## Report` section names six fields and stops. The draft brief carries a JSON template, but its finding id is hardcoded as `R1-01`, so a later round sees a stale example. On 2026-11-19 an independent apply reviewer submitted `A1-01`, then `V1` with status `verified`; the validator refused both with `finding id 'A1-01' must match R1-NN` and `verification for V1 has an unknown status`, and only afterwards did the reviewer read `lib/review/report.js` to learn the contract.

## What Changes

- `lib/review/brief.js` gains one shared report-contract renderer used by both the draft and apply briefs.
- The contract names the report fields, lists the verdict, severity, axis and verification-status enums, shows a finding id for the current round (`R<round>-NN`), and states that `verifications` names only findings recorded before the round, so a first round carries none.
- The apply brief's `## Report` section carries the full contract instead of the field list.
- The draft brief's fixed `R1-01` example becomes the current round's id.
- `lib/tools/review.js` passes the current round and the recorded findings into both builders; a builder called without a round fails instead of rendering a silent default.
- Tests cover both briefs at first and later rounds, including the call sites; `docs/review.md` states that both briefs share the contract.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `change-review`: adds a requirement that both review briefs carry one shared, round-aware report contract.
- `review-documentation`: adds a requirement that `docs/review.md` states the shared per-round contract.

## Impact

- `lib/review/brief.js`: the brief builders and the new shared renderer.
- `lib/tools/review.js`: passes `round` and the recorded findings to both brief builders.
- `test/review-unit.test.mjs`, `test/review-draft.test.mjs`: draft brief round-awareness through the builder and the tool.
- `test/review-reviewer.test.mjs`, `test/review-apply.test.mjs`: apply brief contract assertions.
- `test/review-doc.test.mjs`, `docs/review.md`: the documented statement.
- No report-validation, tool-description, record-format, dependency or runtime change; `lib/tools/review.js` changes only the two builder calls.
