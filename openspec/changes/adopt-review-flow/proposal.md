# Adopt the review flow

## Why

The plugin now has draft review, apply review, self-review and an independent reviewer, but no single document explains the whole review system. The README only carries fragments, and the repository's own workflow does not require a review before apply or archive.

## What Changes

- Add `docs/review.md`: a complete introduction to the review flow, two objects, two reviewer modes, reports, findings, limits, records, failures, configuration and examples.
- Link the document from README and update the review descriptions.
- Update the repository development workflow to require draft review before apply and apply review before archive.
- Add a documentation consistency test that checks tool names, action lists, config keys, defaults and the record path against the code.
- Keep the document out of the published package file list, as approved.

## Capabilities

### New Capabilities

- `review-documentation`: the complete review document and its consistency guard.

### Modified Capabilities

- `development-workflow`: repository changes run the draft and apply review gates before implementation and archive.

## Impact

- `docs/review.md` (new), `README.md`.
- `AGENTS.md` and `openspec/specs/development-workflow/spec.md`.
- `test/review-doc.test.mjs` (new) and the existing review tests.
- No runtime, dependency or configuration change.
