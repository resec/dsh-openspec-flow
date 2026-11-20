# Tasks

## 1. Host lookup

- [ ] 1.1 Select card files by the `${sessionKeyOf(sessionId)}-` name prefix in `lib/review/settings.js` before parsing, and move the legacy record-name check after the filter; rename the existing `corrupt.json` and `invalid-<n>.json` fixtures inside the session-key set so the parse-failure and schema checks stay exercised, keeping one foreign-name case for the new rule; verify in `test/review-cards-endpoint.test.mjs` that a payload-matching file with a foreign name is ignored, a matching legacy card is still read, a corrupt matching card is still skipped, and a malformed unrequested file does not fail the request.
- [ ] 1.2 Scan the primary root and the legacy root independently at most once per request and deduplicate returned cards by absolute file path; verify in `test/review-cards-endpoint.test.mjs` that two project roots sharing a review root return each card once, distinct roots return both cards, the shared card records one turn binding, and − through the counting `io` seam added to `createReviewChannel` − the shared primary root is listed once per request.
- [ ] 1.3 Cache `gitCommonDir()` and `gitTopLevel()` per project root in `lib/review/store.js`, export `clearGitRootCache()`, and clear it from the fixtures; verify in `test/review-store-root.test.mjs` that repeated resolution runs `git` once per root and that clearing forces a fresh resolution.
- [ ] 1.4 Run `npm run test:affected -- lib/review/settings.js lib/review/store.js` and the endpoint and store test files.

## 2. Batch protocol

- [ ] 2.1 Validate `turns` (array, at most 64, positive integer turn, per-turn window rules), collapse a repeated turn to its first entry, sort ascending, answer `byTurn` with one entry per turn (empty when nothing answers) and no merged cards array, and keep the response without `turns` unchanged; verify in `test/review-cards-endpoint.test.mjs` the 65-turn, turn-0 and unparsable-`to` rejections, one entry per requested turn, a repeated turn binding once, and the single-turn compatibility case.
- [ ] 2.2 Implement batch binding under one scan and one directory lock by reusing the per-turn binding, withholding, window and watermark logic in ascending turn order; verify in `test/review-cards-endpoint.test.mjs` that a batch equals sequential runs for bindings and withholding, each turn keeps its own window, an unreadable card does not fail the batch, and a held `<reviewDir>/.lock` leaves the turn's entry in place carrying the other directory's cards while the other turns still answer.
- [ ] 2.3 Write `card-delivery.json` once per directory per batch with the final watermark; verify in `test/review-cards-endpoint.test.mjs` that the batch and sequential runs leave the same `lastDeliveredAt`, a turn end bounds the watermark, and the counting `io` seam records exactly one `writeJsonAtomic` call whose first argument is `<reviewDir>/card-delivery.json` per directory, separate from the bound-card writes.
- [ ] 2.4 Run `npm run test:affected -- lib/review/settings.js`.

## 3. Client batcher

- [ ] 3.1 Add `createCardBatcher(call)` in `client.js` with session buckets, a microtask flush, a 64-turn cap, key dedupe by session/turn/window and `byTurn` dispatch, and expose it through `__test`; verify in `test/review-client.test.mjs` that two turn tails share one call, a 65-turn input splits, duplicate keys do not repeat, and a remount of the same turn after a flush issues a new request and renders the card.
- [ ] 3.2 Wire `ReviewCardTail` to the batcher while keeping the `alive` guard and the single-turn fallback; verify in `test/review-client.test.mjs` that a shared answer for turns 50 and 51 renders only each tail's own card, a failed batch falls back per turn, an absent or empty turn entry renders nothing, and a late answer after unmount does not update state.
- [ ] 3.3 Run `npm run test:affected -- client.js`.

## 4. Documentation

- [ ] 4.1 Update `docs/review.md` for unique per-file delivery across shared review roots, session-key file selection, the batch `turns`/`byTurn` request, the client merge and fallback, the watermark equivalence and once-per-directory write, and the git root cache; verify with the new assertions in `test/review-doc.test.mjs`.
- [ ] 4.2 Update the README review section for the batch request, unique delivery and the `docs/review.md` link; verify with the README assertions in `test/review-doc.test.mjs`.
- [ ] 4.3 Run `node --test test/review-doc.test.mjs`.

## 5. Integration

- [ ] 5.1 Run `openspec_inspect` with `action: "validate"` and `strict: true` for this change and fix every finding.
- [ ] 5.2 Run `npm test`, `npm run verify` and `npm run openspec:check` on Node 24 and record the test and coverage results.
- [ ] 5.3 Measure one `reviewCards/get` for a session with 56 completed turns, report the latency, confirm it stays below 300 ms on the warm cache, and confirm the duplicate card no longer appears.

## Workflow follow-up

- Commit the implementation, run the apply review in the plugin worktree, and archive after the review is ready.
- Apply after `land-apply-worktree` archives to avoid crossing its worktree lifecycle changes.
- After archive, run `npm run bundle:pack`, reinstall the tarball and restart the session before expecting the fix in the running GUI.
