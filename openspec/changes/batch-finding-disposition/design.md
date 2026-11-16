# Design

## Context

`disposeReviewFinding` reads one `id` from the tool arguments, finds that finding, calls `disposeFinding`, and saves the record once ([review.js](lib/tools/review.js#L1124)). `disposeFinding` is the only writer of `finding.issue`; readiness, projections, the reviewer report contract and archive never read it ([report.js](lib/review/report.js#L203)). The review output schema uses `additionalProperties: false`, so any new result field must be declared ([review.js](lib/tools/review.js#L88)). The profile runs both reviews with `reviewers: 1`, which is orthogonal to this design: the changer still disposes findings after reading the report.

See `proposal.md` for why the batch and the removal belong to one change.

## Goals / Non-Goals

Goals:

- One call disposes or waives several findings with per-finding fields.
- The batch is atomic: no partial record write.
- The single `id` form keeps working.
- `issue` disappears from the tool surface and the record write; the docs explain that it is no longer accepted and that old records keep it; `deferred` uses a note.
- Records written before this change stay readable and are not migrated.

Non-Goals:

- No change to readiness rules, severity rules or verification rounds.
- No auto-verification of `fixed` findings.
- No change to the reviewer report schema or the reviewer tool.
- No new tool, dependency or Host service.

## Decisions

### `dispositions` is an array of objects, not `ids` plus shared fields

A `fixed` finding needs its own note describing the fix, so a batch of fixed findings cannot share one note. An `ids` array with top-level `status` and `note` would still force one call per distinct note. Each entry therefore carries `id` and the disposition fields that apply to it. The entry object is closed with `additionalProperties: false` and only `id`, `status`, `note`, `waiver` and `approvedBy`, so an entry-level `issue` is rejected by the host schema instead of being silently dropped.

Alternatives considered: `ids: string[]` with a shared status and note (too weak for distinct fixes); multiple `id` values in one string (ambiguous parsing, no per-id note).

### The single `id` form is normalized to a one-entry batch

`disposeReviewFinding` accepts either `dispositions` or the existing `id` form and converts the latter into a one-entry list. Supplying both fails before the lock, naming the choice. This keeps old calls and old tests valid without a second code path.

### Validation runs on copies, then one write

The tool builds a map from id to the recorded finding, rejects duplicate ids, and clones each target. It calls `disposeFinding` on the clones; any error aborts the whole call. Only after every entry validates does it replace the matching entries in `record.findings` and call `saveReview` once. The lock is taken for the whole operation, so a concurrent writer cannot observe a half-applied batch.

This keeps `disposeFinding` a single-finding primitive. Its rules (fixed needs a note, blockers cannot be deferred or rejected, waiver needs user approval) remain the only validation source.

### Batch errors name the entry and the id

Errors include the entry position and the finding id, for example `dispositions[1] R1-02: deferred needs a note`. Duplicate ids fail before any lookup; an unknown id names itself. This is the same diagnostic quality the single form already provides.

### `waive` reuses the array; top-level waiver fields are defaults

A user waiver usually applies to several findings at once, so `waive` accepts the same `dispositions` array. Top-level `waiver` and `approvedBy` act as defaults for entries that omit them; an entry value wins. `dispose` entries carry their own `status`; a `waive` entry may omit it because the status is fixed. With `dispositions`, the single-form `id`, `status` and `note` are not accepted, so there is no ambiguity about which value wins.

A `waive` call with `scope: "plan-change"` is not a finding disposition: it records a plan-change waiver with `files`, and passing `dispositions` to it fails. The batch path therefore runs only for `dispose` and a finding `waive`, which keeps the existing plan-change contract intact.

### `issue` is removed, not deprecated

The field is unreachable from any consumer. Keeping it as an ignored parameter would leave the schema and documentation describing behavior that does nothing. Removing it makes `deferred` consistent with `fixed` and `rejected`: a note is required. A follow-up issue reference belongs in that note. The tool execution path also rejects an explicit `issue` argument with a migration message, so direct execution (tests, internal callers) behaves like the schema.

Old records keep their `finding.issue` bytes. `disposeFinding` and readiness do not read them, and no migration rewrites the record. Reverting the change therefore stays safe for records written by either version.

### The result carries per-finding statuses

The output gains `dispositions: [{ id, status }]`, declared in the output schema. The summary counters already exist; the array lets the changer confirm each finding without reading the record. Other actions omit the field, so their projections are unchanged. The test suite asserts that the field is declared and that every returned key is covered, following the wait-result test.

### `nextAction` stays a stable action hint

`nextAction` remains `openspec_review action=dispose`; it is a short machine-facing hint, not a parameter tutorial. Batch guidance goes in the tool description, `docs/review.md` and the propose/apply skills, which the changer reads in the same turn. Keeping the string stable avoids churn in readiness tests and in messages that quote the next action.

### Version 0.5.0

Removing a public parameter is breaking. The version moves from 0.4.0 to 0.5.0 in `package.json`, both root `version` fields in `package-lock.json`, the plugin version line in `docs/upgrading-openspec-cli.md`, and all five packaged skills' `metadata.generatedBy`, as the skill test requires. The lockfile and the guide move in the same step so a later `npm install` does not dirty the tree and the pack gate still sees a clean `HEAD`.

## Risks / Trade-offs

- **The model still calls one at a time** → Put the batch instruction in the tool description, `docs/review.md` and both review skills, keep the parameter description value-only, and return the batch result so the model sees the expected shape.
- **A batch entry is rejected after others were valid** → Validate on clones first and write only once; the test suite asserts the on-disk record is unchanged.
- **A large batch grows one tool message** → Entries are small and finding counts are typically low; the alternative is several calls, each repeating the context load and lock.
- **Removing `issue` breaks a caller that used it** → Version bump, schema rejection and an explicit migration message that names a note as the replacement; the shipped docs carry the same note.
- **Old records with `issue` confuse a reader** → Readiness ignores the field; the review document states that the old field is no longer accepted and old records keep it.

## Migration Plan

1. Land the code, tests, docs, skills and version bump in one change.
2. Run `npm test`, `npm run coverage:check` and `npm run openspec:check` on Node 24.
3. Run the apply review on the committed tree.
4. Repack and reinstall the bundle only when the installed plugin must run the new logic; the installed copy is frozen until then.
5. Rollback is a revert of the implementation commit. Records written with the new batch shape remain readable by the previous version because it ignores the extra result field and reads findings by id.

## Open Questions

None.
