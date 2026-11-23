# Tasks

## 1. Close a stale draft round as blocked

- [ ] 1.1 Add optional round metadata to `submitReport` and a `closeStaleRound` helper in `lib/review/submit.js` that records a blocked report with no findings, `blockedReason: "stale-object"`, `staleFrom` and `staleTo` on a round that has no report, validating the report shape against an empty finding set so a `fixed` finding does not refuse the close; verify with unit tests in `test/review-unit.test.mjs` for the report and hashes, the unchanged finding statuses, and the close while a finding awaits verification.
- [ ] 1.2 Replace the draft rebind branch in `lib/tools/review.js` so `resume` reuses a round only when the current hash equals the round hash, and otherwise closes the stale round as blocked, opens the next round and wakes the reviewer; verify with tests in `test/review-draft.test.mjs` for reuse, the blocked close, the close with a `fixed` finding, and the wake.
- [ ] 1.3 Keep the apply review's rebind branch unchanged and state why in a comment; verify the existing apply resume tests still pass.

## 2. Accept a stale blocked submission from the reviewer

- [ ] 2.1 In `lib/review/reviewer-tool.js`, scope the stale rule to the draft review, accept a `blocked` report with no findings while the object is stale, record both hashes and the cause without validating against recorded findings, and refuse every other verdict with a message that names `blocked`; verify with tests in `test/review-reviewer.test.mjs` for the accepted blocked report, the close with a `fixed` finding, the refused pass, the refused blocked-with-findings and the untouched apply path.

## 3. Watch an open draft round

- [ ] 3.1 Add `lib/review/watch.js` with an injectable watch factory, a debounce timer, a per-directory registry and one notice per round keyed on the round number, then create `test/review-watch.test.mjs` with the one-notice, silent-second-change, later-round-notice, late-submission and lock-contention cases; verify by running that test file.
- [ ] 3.2 Wire the watch into the draft round in `lib/tools/review.js` (arm when a round opens, disarm on a recorded report or an abandoned review), send the notice with the moved hash, the round number and the `blocked` instruction for that round, resolve the changer agent for the reviewer message with a logged skip when it is gone, and dispose every watch on plugin unload in `index.js`; add the disarm, dispose and missing-changer cases to the watch test module and verify by running it.

## 4. Guidance and documentation

- [ ] 4.1 State the no-edit rule and the blocked recovery in the flow rule text in `lib/policy.js`; verify with the policy text assertions in `test/policy.test.mjs`.
- [ ] 4.2 Qualify the reuse sentence at `docs/review.md` (the reuse and missing wakeup hold only while the object is unchanged) and add the stale-round section; verify with the document text assertions in `test/review-doc.test.mjs`.
- [ ] 4.3 Pin the readiness next action for an unreported stale draft round at `resume` and for an unchanged one at `wait` with regression tests in `test/review-wait.test.mjs`; verify both assertions fail if the readiness branches are swapped.

## 5. Integration

- [ ] 5.1 Run `openspec_inspect` with `action: "validate"` and `strict: true` on the change and report the result.
- [ ] 5.2 Run `npm run test:affected -- lib/tools/review.js lib/review/submit.js lib/review/reviewer-tool.js lib/review/watch.js lib/policy.js` and report the result.
- [ ] 5.3 Run `npm run verify` on Node 24 and report the test summary and coverage verdict.

## Workflow follow-up

- Run the apply review on the committed tree and fix every blocker.
- Land the change with `openspec_apply_worktree action=land` after the user's explicit request.
- Dry-run and push with `node scripts/push-landed.mjs`.
