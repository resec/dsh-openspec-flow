# Tasks

## 1. Handoff result and report reader

- [x] 1.1 Update the handoff reader in `scripts/pr-review-watch.mjs` to accept the full `openspec_review action=report review=pr` result (`report`, `ready`, `reasons`) and the legacy report-only object; validate the report, head, `ready` and `reasons`; verify with new cases in `test/pr-review-watch.test.mjs` that the full shape parses and a legacy shape is accepted.
- [x] 1.2 Update the `comment` command to pass the full handoff result to the renderer and keep the dry-run output inspectable; verify with a `test/pr-review-watch.test.mjs` dry-run case that no GitHub call is made and the result is visible.
- [x] 1.3 Update the handoff section of `docs/pr-review.md` to name the full result and the legacy `not passed` rule; verify `test/pr-review-doc.test.mjs` passes and names the handoff shape.
- [x] 1.4 Add `format=2` to the hidden marker and record `commentFormat` in watch state; make the marker check and `publishComment` accept only the current format, and make `filterCandidates` re-emit a commented head whose recorded format is older while skipping a current-format head; verify `test/pr-review-watch.test.mjs` covers an old comment that is still present when a new-format comment is published, a current-format skip, an already-current entry without the format settling to `commented` with `commentFormat: 2`, the state update, and poll's old-format candidate versus current-format exclusion.

## 2. Review result and stable numbers

- [x] 2.1 Replace the `**Verdict:**` line in the comment renderer with `**Review result:** passed` or `not passed` taken only from `ready`, and render `reasons`; verify `test/pr-review-watch.test.mjs` covers ready true, ready false and a legacy handoff without `ready`.
- [x] 2.2 Add `findingNumbers` and `nextFindingNumber` to watch state and assign `F1`, `F2`, `F3` on first appearance in record order, then report order, then verification order; persist the map only on `--apply`; verify with `test/pr-review-watch.test.mjs` cases for assignment, reuse across rounds, next number and dry-run non-persistence.
- [x] 2.3 Remove severity and internal ids from the finding table and verification lines, and map readiness reasons that name an internal finding id to its `F` number, assigning a number when the id is seen only in a reason; verify `test/pr-review-watch.test.mjs` asserts no `R<round>-NN`, `E<n>-NN`, `critical`, `major`, `minor` or `nit` appears and covers a reason-only id.
- [x] 2.4 Update the comment-format and State sections of `docs/pr-review.md` with the `Review result` line, the `F` number table, the hidden-marker format, the PR-local scope of `F` numbers, `findingNumbers` and `nextFindingNumber`; verify `test/pr-review-doc.test.mjs` passes and fails when the result line or a state field is removed.

## 3. Full finding state

- [x] 3.1 Read `<git common dir>/openspec-flow/review/local#<change>/pr-review.json` in `scripts/pr-review-watch.mjs` with the `local#<change>` key and the single `*#<change>` fallback, and render every recorded finding's `F` number, location, problem, suggestion and lifecycle state; verify with a `test/pr-review-watch.test.mjs` fixture that contains open and closed findings.
- [x] 3.2 Fall back to the handoff report's findings and verifications when the record is missing, unreadable or malformed, and mark the state unavailable; verify with `test/pr-review-watch.test.mjs` cases for a missing record, a finding known only from the report and a reason-only id.
- [x] 3.3 Update the finding-state section of `docs/pr-review.md` with the record path, the key, the same-repository convention, the fallback and the reason-id mapping; verify `test/pr-review-doc.test.mjs` names the record and the fallback.

## 4. Trusted review result

- [x] 4.1 Change `trustedPass` in `scripts/pr-review-watch.mjs` to take the latest trusted marker for the head and accept only `**Review result:** passed`; verify with `test/pr-review-watch.test.mjs` cases for a new-format pass, an old-format verdict and a later `not passed` comment.
- [x] 4.2 Update `scripts/pr-review-owner-review.mjs` to use the new trusted check for eligibility and invalidation; verify `test/pr-review-owner-review.test.mjs` covers the label not being added for an old comment and being added for a new-format pass.
- [x] 4.3 Update `scripts/pr-review-land.mjs` and the `candidates` path to use the new trusted check; verify `test/pr-review-land.test.mjs` refuses landing for an old comment and for a latest `not passed`, and lists a new-format pass.
- [x] 4.4 Audit `scripts/pr-local-shared.mjs`, `scripts/pr-publish.mjs` and `scripts/pr-local-land.mjs`; keep the local owner flow on the `apply` review record unless the entry model changed its resolution; verify `node scripts/run-tests.mjs plugin -- test/pr-local-land.test.mjs test/pr-publish.test.mjs test/local-pr-spec.test.mjs` passes, and update the shared record resolver with a regression test if the entry model changed the `apply` record path.
- [x] 4.5 Update the trusted-result and migration section of `docs/pr-review.md` (old comments are not trusted; a new comment is required); verify `test/pr-review-doc.test.mjs` passes and `test/local-pr-doc.test.mjs` still passes.

## 5. Contributor PR flow on the `pr` entry

- [x] 5.1 Update `prepare` in `scripts/pr-review-watch.mjs` to validate the copied baseline's `reviews.pr` tree profile with `reviewers: 1`, reject a missing or invalid entry, and set `pipeline.beforeArchive` to `pr` in the copy without rewriting `reviews.apply`; verify with a `test/pr-review-watch.test.mjs` fixture that asserts the copied configuration.
- [x] 5.2 Verify the repository baseline declares `profiles.pr-tree` and `reviews.pr` (supplied by `review-entry-model`) with `passCriteria: "nit"`, `allowDeferred: false` and `allowRejected: false` (supplied by `review-pass-criteria`), and fail the task when either is absent instead of adding them here; verify `npm run openspec:check` passes and `node -e "const c=require('./openspec/reviews.json'); const p=c.profiles[c.reviews.pr]; if (!p || p.object!=='tree' || p.passCriteria!=='nit' || p.allowDeferred!==false || p.allowRejected!==false) process.exit(1)"` succeeds.
- [x] 5.3 Update the session flow in `docs/pr-review.md` to use `openspec_review action=status review=pr`, `action=start review=pr`, `action=resume review=pr`, `action=wait review=pr` and `action=report review=pr`, remove the `apply`-entry instructions, and rewrite the statement that only `status: commented` stops re-emission: a commented head stops being re-emitted only when the watch entry records the current comment format, while an older or missing format is re-emitted for publication. Verify `test/pr-review-doc.test.mjs` names `review=pr`, no stale `review=apply` remains in the contributor session section, and the format-aware re-emission rule is asserted.
- [x] 5.4 Update the landing steps, review-failed recovery, stalled-review recovery, self-mode recovery and State sections of `docs/pr-review.md` to use `review=pr` and `pr-review.json`, to name the `pr-tree` profile and `pipeline.beforeArchive`, and to list `findingNumbers` and `nextFindingNumber`; verify `test/pr-review-doc.test.mjs` covers those sections, the profile and both state fields.
- [x] 5.5 Update `reviewRecordPath` in `scripts/pr-review-land.mjs` and the final-review gate to read `pr-review.json`; verify `test/pr-review-land.test.mjs` covers the passed record and the missing or mismatched tree cases.
- [x] 5.6 Update the contributor PR paragraphs in `AGENTS.md` from an apply review and `apply-review.json` to the `pr` review and `pr-review.json`; verify a text search of the PR loop paragraph finds `review=pr` and no `apply review` for the contributor flow.
- [x] 5.7 Update the PR-flow specification's local-flow boundary in `docs/pr-review.md` so it states that the local owner-managed flow keeps `apply-review.json`; verify `test/local-pr-doc.test.mjs` passes.
- [x] 5.8 Update the pull-request review descriptions in `README.md` and `CONTRIBUTING.md` from an apply review on the head to the `pr` review and `pr-review.json`; verify a text search finds no stale apply-review claim for the contributor flow and `npm run openspec:check` still passes.

## 6. Integration

- [x] 6.1 Run `node scripts/run-tests.mjs plugin -- test/pr-review-watch.test.mjs test/pr-review-owner-review.test.mjs test/pr-review-land.test.mjs test/pr-review-doc.test.mjs` and confirm every test passes.
- [x] 6.2 Run `npm run verify` on Node 24 and confirm the test summary and coverage verdict pass.
- [x] 6.3 Run `npm run openspec:check` and confirm the change and main specs validate.

## Workflow follow-up

- `review-entry-model` must be archived before this change's implementation starts; its `pr` entry and `pipeline.beforeArchive` behavior are the base for every task in Group 5.
- `review-pass-criteria` must be archived before the `pr-tree` profile's `passCriteria: "nit"`, `allowDeferred: false` and `allowRejected: false` take effect; confirm the baseline declaration and do not add it in this change.
- Old-format commented heads are re-emitted for publication only; do not edit old comments and do not open a review round for them. After the implementation review and archive, re-review every open pull request for its current head so a new-format comment exists; owner-review and landing will not trust the old comments.
