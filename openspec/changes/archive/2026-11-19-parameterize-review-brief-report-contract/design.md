# Design

## Context

See `proposal.md` - Why. The brief is the only model-facing home for the report contract: `openspec_reviewer` declares its `report` parameter as "The report described in the brief" (`lib/review/reviewer-tool.js:128`). The validator is the authority for the enums and the id rule (`lib/review/report.js:16`, `:22`, `:62`, `:67`, `:102`).

The current briefs split the contract in a way this change must replace: `buildDraftBrief` owns a JSON template with two hardcoded `R1-01` ids (`lib/review/brief.js:195-220`), while `buildApplyBrief` only names the report fields and points at the draft template with "Use the same finding fields as draft review" (`lib/review/brief.js:136`). Neither builder receives a round or the recorded findings: `startDraftReview` calls with the change, hashes, files, project root and requirement length only (`lib/tools/review.js:768-775`), and `applyReviewEntry` calls with the commit, tree, diff, validation and plan fields only (`lib/tools/review.js:1094-1108`). The local draft prompt constant `AXES` (`lib/review/brief.js:18`) collides with the validator's exported `AXES`.

## Goals / Non-Goals

Goals:

- One renderer owns the whole `## Report` block for both briefs, including the JSON template, the post-submit note and the verdict rule.
- Both builders require the current round and receive the recorded findings.
- A first round renders `"verifications": []` with no example id.
- Both briefs list every required finding field, including `title`.

Non-Goals:

- Do not change report validation, error text or tool descriptions.
- Do not rewrite historical briefs under `openspec/.review/**`.
- Do not encode the `verified-fixed` preconditions or the recorded-finding status rules in the contract; they stay with the validator.

## Decisions

### The renderer owns the whole Report block

Add `renderReportContract({ round, priorFindings = [], locationHint })` to `lib/review/brief.js`; it returns the whole block: the field list, the JSON template, the enums, the id rule, the verification rule, the post-submit note ("After you submit, write no review summary ...") and the verdict rule ("A `pass` verdict cannot ..."). `buildDraftBrief` deletes its own template, its "Write one JSON object ..." sentence, its post-submit note and its verdict rule; the apply brief deletes its field list, its "Write one JSON object ..." sentence, its "same finding fields" pointer, its post-submit note and its verdict rule. Both append the renderer's block, so the field list, the post-submit note and the verdict rule each appear once. `locationHint` is required and keeps the kind-specific location wording: `relative path:line or artifact section` for draft, `repository-relative path and line` for apply. Rejected alternative: append a contract next to the old draft template, which would state that round 1 has no verifications and then show an `R1-01` verification example a few lines later, and would duplicate the field list, the post-submit note and the verdict rule.

### Builders require an explicit round

Both builders validate that `round` is a positive integer and throw otherwise, with the builder name in the message. Call sites pass the local `round` and `record.findings ?? []`. Rationale: a default of 1 would recreate the stale-example bug while the unit tests pass.

### Enums from the validator, with a renamed local constant

Import `AXES as REPORT_AXES`, `SEVERITIES`, `VERDICTS` and `VERIFICATION_STATUSES` from `lib/review/report.js`, and rename the existing draft prompt constant to `DRAFT_AXES`. The original plan's `import { AXES }` would be a duplicate declaration and every module importing `brief.js` would fail to load.

### Axis values versus axis prompts

The contract lists `REPORT_AXES` and states that a finding's `axis` must be one of those values, while the brief's `## Axes` headings are review prompts, not report values. Rationale: the apply brief's Conformance, Archive readiness and Scope control headings have no enum counterpart, so a reviewer otherwise invents an axis the validator refuses.

### Template, example form and verification example

The template's finding id is `R${round}-01` and the rule text is `R<round>-NN`. When `priorFindings` is empty, `verifications` renders as `[]` and no example id appears; otherwise the example is the first recorded finding whose status is `open` or `fixed`, and the block states that verifications name only findings recorded before the round and that a newly reported finding does not go there. When no recorded finding is `open` or `fixed`, no example id appears and only the rule and enum remain. The prior-finding scenario pins `R1-01` to status `fixed`, so the test does not have to guess a status.

### Field list and conditional fields

The shared field list names `id`, `severity`, `axis`, `location`, `title`, `problem`, `evidence` and `suggestion`, and marks `impact`, `rule` and `failure` as required only for critical and major findings. Rationale: the apply brief relied on the draft template for `title`, so removing the template without moving the field list would make every apply finding fail `title` validation.

## Risks / Trade-offs

- Removing the draft template without moving every field into the renderer → tests assert both briefs list `title` and every required finding field, and that a round-1 brief has no verification example id.
- `priorFindings` may be undefined at a call site → the renderer defaults it to `[]`, and both call sites pass `record.findings ?? []`.
- The open/fixed example preference is filtering logic → task 1.1 covers a `fixed` example, a record with no eligible finding, and an empty record.
- `verified-fixed` still requires a prior `dispose` to `fixed` → residual risk; the validator keeps its existing message.
- Brief length grows by roughly 0.6-1 KB per round → acceptable.
- The documentation sentence may land in an unexpected section → task 3.1 names the existing brief paragraphs in `docs/review.md`, and the documentation test asserts the sentence.

## Migration Plan

No storage or configuration migration. Historical briefs are not rewritten. Rollback is a revert of `lib/review/brief.js`, `lib/tools/review.js` and the tests.

## Open Questions

None.
