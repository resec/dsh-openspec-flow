# Proposal: review-pass-criteria

## Why

The review gate currently treats `critical` and `major` findings as the only blockers. A project cannot choose the severity floor that fails a review, cannot allow `deferred` or `rejected` findings only below that floor, and cannot express "all findings resolved" for a pull-request review without changing the plugin. The hard-coded rule also makes `pass` and readiness disagree once the floor is configurable.

## What Changes

- Add three optional profile fields: `passCriteria` (`critical`, `major`, `minor` or `nit`; default `major`), `allowDeferred` (boolean; default `true`) and `allowRejected` (boolean; default `true`). Invalid values SHALL fail the configuration read. `openspec_init` SHALL write all three explicitly in the default draft and apply profiles.
- Define the severity order `critical > major > minor > nit`. A finding at or above `passCriteria` is an in-threshold finding. An in-threshold finding SHALL only be disposed as `fixed` or user `waived`; a below-threshold finding MAY be `deferred` or `rejected` when its profile switch allows it. A closed switch refuses that disposition for every finding.
- Add verification statuses `verified-deferred` and `verified-rejected`, accepted only for a finding already `deferred` or `rejected`. Acceptance closes the finding; `still-open` returns it to `open`. Add the matching finding terminal statuses.
- **BREAKING**: Readiness SHALL require every in-threshold finding to be `verified`, `verified-deferred`, `verified-rejected` or user `waived`. A below-threshold finding SHALL NOT block readiness whatever its status. A `pass` report SHALL require the same in-threshold resolution; `changes-requested` SHALL require at least one unresolved in-threshold finding.
- Lock `passCriteria`, `allowDeferred` and `allowRejected` in the policy per review section. A legacy policy without them SHALL read `major`, `true` and `true` and SHALL NOT be rewritten. Raise the policy schema one level above the version recorded by `review-entry-model` (expected `3`, so this change records `4`).
- Extend `summarizeFindings` with `verifiedDeferred` and `verifiedRejected`; make `blocking` count unresolved in-threshold findings. Report both counts in the `openspec_review` status schema and the review-card payload. The brief, the reviewer finding read and the read-only configuration page SHALL show the new criteria and statuses.
- Update `openspec/reviews.json`: `standard-directory` and `standard-tree` explicitly carry `passCriteria: "major"`, `allowDeferred: true` and `allowRejected: true`; the `pr-tree` profile introduced by `review-entry-model` carries `passCriteria: "nit"`, `allowDeferred: false` and `allowRejected: false`.
- This change SHALL NOT modify `scripts/pr-review-watch.mjs` or any pull-request script. The pull-request report format is a separate change.

## Capabilities

### Modified Capabilities

- `change-review`: finding lifecycle, dispositions, verification, readiness, report verdict validation, policy locking and the brief report contract.
- `review-configuration`: profile parameters, optional defaults and the read-only page.
- `tool-surface`: disposition refusals, verification status, status counts and the default `openspec_init` document.
- `review-documentation`: `docs/review.md` disposition table, readiness, configuration defaults and finding statuses, plus the README configuration statement.

## Impact

- Plugin code: `lib/review/config.js`, `lib/review/file.js`, `lib/review/policy.js`, `lib/review/report.js`, `lib/review/submit.js`, `lib/review/readiness.js`, `lib/review/brief.js`, `lib/review/settings.js`, `lib/review/cards.js`, `lib/tools/review.js`, `client.js`.
- Project files: `openspec/reviews.json`; `docs/review.md` and `README.md`.
- Tests: `test/review-unit.test.mjs`, `test/review-file.test.mjs`, `test/review-draft.test.mjs`, `test/review-apply.test.mjs`, `test/review-reviewer.test.mjs`, `test/review-status-mode.test.mjs`, `test/review-cards.test.mjs`, `test/review-client.test.mjs`, `test/review-settings.test.mjs`, `test/review-doc.test.mjs`, `test/config.test.mjs`.
- Dependency: `review-entry-model` SHALL archive first. This change's delta is drafted against the current main specs and SHALL be merged with the archived entry-model text, not merely rebased. Every shared MODIFIED block SHALL retain the entry model's `reviews` entry keys, `pipeline.beforeApply`/`beforeArchive` mapping, entry-named policy sections and records, configuration-page entries and pipeline, `openspec_init` default document shape, brief and README entry facts. The `pr-tree` profile is preserved by task 6.3 in `openspec/reviews.json`. The merge is a numbered task. If the entry model does not raise the schema version as expected, coordinate the actual version and record it in `design.md`.
- Behavior: open below-threshold findings no longer block readiness, and a `pass` report can carry them; this is the intended **BREAKING** change.
