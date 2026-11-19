# Tasks

## 1. Shared contract renderer

- [x] 1.1 Add `renderReportContract({ round, priorFindings = [], locationHint })` to `lib/review/brief.js`; it owns the whole `## Report` block: the field list (`id`, `severity`, `axis`, `location`, `title`, `problem`, `evidence`, `suggestion`, plus `impact`/`rule`/`failure` for critical or major only), the JSON template, the enums, the axis-mapping sentence, the `R<round>-NN` rule, the verification rule, the post-submit note and the verdict rule; `locationHint` is required; import `AXES as REPORT_AXES` and rename the local draft prompt constant to `DRAFT_AXES`; verify with unit tests for round 1 with no findings (`"verifications": []`, no example id), round 2 with no findings (`R2-01`), a record holding `R1-01` in status `fixed`, a record with no eligible finding, the axis-mapping sentence, the conditional fields, the post-submit note and verdict rule, and a missing or non-positive round.
- [x] 1.2 Replace `buildDraftBrief`'s existing JSON template, its "Write one JSON object ..." sentence, its post-submit note and its verdict rule with the shared block, pass its artifact-section `locationHint`, and update the direct builder calls in `test/review-unit.test.mjs` to pass `round`; verify a round-2 build with no recorded findings shows `R2-01` and no `R1-01`, a round-1 build renders `"verifications": []`, and the field list, post-submit note and verdict rule each appear once.
- [x] 1.3 Pass the local `round` and `record.findings ?? []` from `startDraftReview` in `lib/tools/review.js`; verify in `test/review-draft.test.mjs` through `openspec_review` that round 2's brief names `R2-01`.

## 2. Apply brief and call site

- [x] 2.1 Replace `buildApplyBrief`'s field list, its "Write one JSON object ..." sentence, its post-submit note, its verdict rule and its "Use the same finding fields as draft review" pointer with the shared block and the apply `locationHint` (`repository-relative path and line`), and update the direct builder calls in `test/review-reviewer.test.mjs` to pass `round`; verify in `test/review-reviewer.test.mjs` that a round-1 apply brief lists `title` and every required finding field, carries the rule, the `R1-01` finding example and the three verification statuses, and renders `"verifications": []`, with the field list, post-submit note and verdict rule each appearing once.
- [x] 2.2 Pass `round` and `record.findings ?? []` from `applyReviewEntry` in `lib/tools/review.js`; verify in `test/review-apply.test.mjs` through `openspec_review` that a later round starting with `R1-01` in status `fixed` names it as the verification example and does not claim verifications must be empty.

## 3. Documentation

- [x] 3.1 Update `docs/review.md` to state that both briefs render one round-aware report contract from the same source, covering the finding-id rule and the empty first-round verifications; reconcile the existing "上一轮" wording with "recorded before the round" in the brief paragraphs; add the matching assertion in `test/review-doc.test.mjs` and run it with `node --test test/review-doc.test.mjs`.

## 4. Integration checks

- [x] 4.1 Run `npm run test:affected -- lib/review/brief.js lib/tools/review.js test/review-unit.test.mjs test/review-draft.test.mjs test/review-reviewer.test.mjs test/review-apply.test.mjs test/review-doc.test.mjs` and confirm the selected suites pass.
- [x] 4.2 Run `openspec_inspect` with `action: "validate"` and `strict: true` and confirm zero issues.
- [x] 4.3 Run `npm run verify` on Node 24 and confirm the test summary and coverage verdict pass.

## Workflow follow-up

- Archive the change after apply and its review are complete, when the user asks.
