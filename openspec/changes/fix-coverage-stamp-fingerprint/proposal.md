# Proposal

## Why

The coverage stamp's fingerprint names `lib/`, `test/`, `index.js` and six scripts under `scripts/`, but the suite also loads `client.js`, `reviewer.js` and `scripts/check-pre-push.mjs`. A commit that only touches one of those files leaves the fingerprint unchanged, so `checkStamp` still reports `ok` and the pre-push hook skips `npm run verify` for a commit the suite would reject.

## What Changes

- Add `client.js`, `reviewer.js` and `scripts/check-pre-push.mjs` to the fingerprinted inputs.
- Restate the requirement's path list so it names the entry points and the pre-push script.
- Add a scenario for a commit that only touches one of the three files.
- Cover each of the three files with a stamp test, plus a commit outside the list that keeps the stamp.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `coverage-gate`: the fingerprint requirement lists the package entry points and `scripts/check-pre-push.mjs` alongside `lib/`, `test/` and the gate scripts.

## Impact

- `scripts/coverage-stamp.mjs`: the input list and its comment.
- `test/coverage-stamp.test.mjs`: the expected list, the fixture inputs and four new cases.
- `openspec/specs/coverage-gate/spec.md`: through the delta.
- `scripts/install-hooks.mjs` needs no edit: its message names the invalidation causes, not the list.
