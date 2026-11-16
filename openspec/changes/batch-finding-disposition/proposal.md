# Batch finding disposition and remove the issue field

## Why

The changer disposes review findings one at a time: `openspec_review` accepts a single `id`, so six findings cost six calls, each loading the change context, taking the review lock, re-reading and rewriting the record. The `issue` parameter is never read by readiness, output projections, reviewer reports or archive; it only adds a second way to satisfy `deferred` and a field that no downstream step consumes. More calls mean more tokens and more lock contention during the phase that already blocks apply.

## What Changes

- Add `dispositions`, an array of finding entries, to `openspec_review` for `dispose` and a finding `waive`. Each entry carries its own `id`, `status`, `note`, `waiver` and `approvedBy`, so one call disposes several findings.
- Keep the single `id` form working. A call supplies either `id` or `dispositions`, never both.
- Apply the batch atomically: validate every entry before writing, and leave the record unchanged when any entry is invalid. Return one `dispositions` result entry per finding.
- **BREAKING** Remove the `issue` parameter, its record write and its use as a `deferred` requirement. A `deferred` finding now needs a `note`; the follow-up reference goes into that note.
- Let a finding `waive` accept the same array; its top-level `waiver` and `approvedBy` act as defaults for entries that omit them. A plan-change `waive` keeps its `files` form and rejects `dispositions`.
- Update the tool description, `docs/review.md`, the review and finding table, the propose and apply skills, and the version to 0.5.0.
- Cover batch success, batch rollback, duplicate and unknown ids, both forms together, a batch with top-level single-form fields, plan-change waiver exclusion, single-form compatibility, batch waiver and the declared output field with regression tests.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `change-review`: finding dispositions accept a batch, applied atomically; plan-change waivers stay on their `files` form; `deferred` requires a note and the record no longer carries an issue field.
- `tool-surface`: `openspec_review` exposes `dispositions` alongside the single `id` form and returns per-finding results.
- `review-documentation`: the review document describes batch disposition and the note-only `deferred` rule.
- `skill-adaptation`: the propose and apply skills dispose all remaining findings in one `dispositions` call.

## Impact

- `lib/tools/review.js`: parameter schema, output schema, `disposeReviewFinding`, tool description.
- `lib/review/report.js`: remove the issue branch and record write; keep single-finding validation.
- `docs/review.md`, `README.md`: disposition table and examples.
- `skills/openspec-propose/SKILL.md`, `skills/openspec-apply-change/SKILL.md`: batch disposition guidance.
- `test/review-draft.test.mjs`, `test/review-apply.test.mjs`, `test/review-unit.test.mjs`, `test/review-doc.test.mjs`, `test/skills.test.mjs`: batch, removal, plan-change exclusion, output-schema and skill-content regressions.
- `package.json`, `package-lock.json`, `docs/upgrading-openspec-cli.md` and the five packaged skills: version 0.5.0 and `generatedBy`.
- No new dependency, runtime or Host service. The review record shape loses one optional field; existing records keep their bytes and read unchanged.
