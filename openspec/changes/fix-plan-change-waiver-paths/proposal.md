# Proposal: fix-plan-change-waiver-paths

## Why

A plan-change waiver records the `files` strings it receives, but the apply review compares them with drift paths relative to the change directory. A waiver recorded with `openspec/changes/<change>/proposal.md` or an absolute path is stored, reported as recorded, and never matches `proposal.md`; the next `start` or `resume` fails with "the apply review needs a user waiver for the changed plan files" even though the waiver exists.

The failure is reproducible. In change `speed-up-test-execution`, the first apply review `start` failed after the waiver was recorded with project-relative paths; a second `waive` with the same form failed again; only a third `waive` with `proposal.md, tasks.md` let `start` proceed. The resulting `plan-change-waiver.json` now carries both forms, two of which can never match.

The `waive` result also reports the draft projection's `ready: true` with `nextAction: openspec_review action=start review=apply` when the recorded file set covers nothing, which hides the mismatch.

The `change-review` waiver requirement does not state a path basis, and the `tool-surface` tool requirement and the shipped docs only say "with the approved files". The current test suite covers relative paths only, so the gap is untested.

## What Changes

- Add one path normalizer for plan-change waiver files. It accepts a change-relative path, a project-relative path under the change directory, and an absolute path under the change directory, and converts each to a POSIX path relative to the change root.
- Reject an entry that escapes with `..`, is an absolute path outside the change directory, names another change, or is a project-relative `openspec/` path outside the change directory; keep the current trim-and-drop for an empty entry. The error names the refused entry and the accepted forms.
- Normalize on write: `waive` stores the normalized list, and normalizes an existing recorded list before merging, so a legacy record is cleaned up by the next waiver.
- Normalize before compare: apply review `start` and `resume` normalize the recorded file set before checking drift, so a legacy record becomes effective immediately.
- Accept a file that does not exist yet. A plan change is approved before the edit, and a new spec file does not exist when the user approves it; the normalizer checks containment, not existence.
- Return an accurate waiver result: report readiness only when an apply record exists, the drift is non-empty, and every drifted file is covered. A waiver recorded before the edit, in a draft-disabled project, or before the apply start reports `ready: false` with the reason instead of the draft's readiness, and names any uncovered file.
- State the path basis in the waive error, the `files` parameter description, `README.md`, the apply skill and the flow policy text.
- Add regression tests for the accepted forms, the refusals, the legacy record and the returned diagnosis.

## Capabilities

### Modified Capabilities

- `change-review`: a plan-change waiver records paths relative to the change directory, accepts the three forms on input, refuses an escaping or foreign path, and an apply review start or resume compares normalized paths, so a legacy waiver takes effect. The waiver result asserts coverage only when an apply record, a non-empty drift and full coverage exist.
- `tool-surface`: the `openspec_review` `files` parameter documents the accepted path forms and the normalization, and the plan-change waiver result reports uncovered drift without claiming readiness.

## Impact

- Code: new `lib/review/waiver.js` (normalizer), `lib/tools/review.js` (`waivePlanChange`, the `applyReviewEntry` drift check, the `files` schema description).
- Tests: `test/review-apply.test.mjs` (accepted forms, refusals, legacy record, result diagnosis), a new `test/review-waiver.test.mjs` (normalizer unit cases).
- Docs: `README.md`, `docs/review.md`, `skills/openspec-apply-change/SKILL.md`, `lib/policy.js`; `test/policy.test.mjs` and `test/review-doc.test.mjs` follow any text change.
- No dependency, review record schema, card payload or `dist/` change. Existing waiver files stay readable and become effective without migration.
