# Tasks

## 1. Review-card write points

- [x] 1.1 Remove the `phase: "review"` card write and its marker from `waitReview` in `lib/tools/review.js`, in line with the `change-review` delta that drops the card-marker clause; verify `wait` still returns the report, readiness and next action by running the wait tests.
- [x] 1.2 Remove the `phase: "review"` card write from `readReport` and drop the now-unused `agent` parameter and call argument; verify `report` still returns the stored report by running the report tests.
- [x] 1.3 Update `test/review-cards-flow.test.mjs`: an independent review writes one reviewer card and no changer card, `wait`/`report` write none, and a `report` after a failed self-review card write leaves `cards/` and the record markers unchanged; verify with `node --test test/review-cards-flow.test.mjs` on Node 24.22.2.
- [x] 1.4 Update the write-points paragraph in `docs/review.md` and the card assertions in `test/review-doc.test.mjs`; verify the doc test passes.
- [x] 1.5 Rewrite the review-report paragraph in `skills/openspec-propose/SKILL.md` and `skills/openspec-apply-change/SKILL.md` to name the reviewer session for an independent review and the changer session for a self review, and extend `test/skills.test.mjs` to pin the wording; verify with `node --test test/skills.test.mjs` on Node 24.22.2.

## 2. Host delivery filter

- [x] 2.1 Add the record-based review-card filter to `readCards` in `lib/review/settings.js`, select `apply-review.json` or `review.json` by the card's recorded review kind, key the per-request cache by directory and kind, and guard the record read; verify with `npm run test:affected -- lib/review/settings.js`.
- [x] 2.2 Add endpoint tests for a legacy changer card, an already-bound changer card, a reviewer card, a self-review card, a directory holding both a draft self card and an apply changer card, a card with no recorded review kind against a draft self record, a valid record with no `changerSessionId` (card delivered), and missing/corrupt records; verify with `node --test test/review-cards-endpoint.test.mjs` on Node 24.22.2.
- [x] 2.3 Document the changer-session delivery rule in `docs/review.md` and extend the doc-test assertions; verify the doc test passes.
- [x] 2.4 Update the review-card sentence in `README.md`; verify the documentation tests pass.

## 3. Card summary

- [x] 3.1 Add the change-name segment to `cardSummary` in `client.js` and cover present and absent names in `test/review-client.test.mjs`; verify with `node --test test/review-client.test.mjs` on Node 24.22.2.
- [x] 3.2 Document the summary order in `docs/review.md` and extend the doc test; verify the doc test passes.

## 4. Integration

- [ ] 4.1 Run `npm run verify` on Node 24.22.2 and `openspec_inspect` with `action: "validate"` and `strict: true`; verify both pass.
- [ ] 4.2 Review the final diff for unintended changes to the card payload, review records, card file layout or tool results; verify by inspecting `git diff --stat` and the touched public shapes.

## Workflow follow-up

- Seal the ready draft with a commit that contains only the change directory.
- Apply the change, mark tasks done, commit each implementation round, and run the apply review before archive.
- Archive only on the user's request.
