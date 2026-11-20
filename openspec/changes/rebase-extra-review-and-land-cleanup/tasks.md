# Tasks

## 1. Round model and report

- [x] 1.1 Add shared round token parsing and resolution in `lib/review/record.js`: a positive integer or `E<n>`, a helper that lists normal and extra entries, a helper that resolves a requested token and a helper for the current apply round; extend the record shape with optional `extraRounds`, per-entry `seq`, `firstRoundToken`/`verifiedInRoundToken` finding fields and `rebaseReview`; verify with `test/review-unit.test.mjs` cases for `1`, `E1`, `E0`, `R1` and a legacy record without the new fields.
- [x] 1.2 Accept `E<n>-NN` finding ids in `lib/review/report.js`, keep numeric `firstRound`/`verifiedInRound` from the shared sequence and record the token fields; verify an extra id is accepted, a normal id is refused in an extra round, a fix is verified across an extra round and a legacy finding without tokens still reads, in `test/review-unit.test.mjs` and `test/review-apply.test.mjs`.
- [x] 1.3 Make report submission in `lib/review/submit.js` resolve the current entry through the shared helper and store extra reports under `apply-round-<token>`; verify the stored path, report retrieval and the no-second-report guard in `test/review-apply.test.mjs`.
- [x] 1.4 Resolve extra rounds in `lib/review/reviewer-tool.js` for `brief`, `status`, `findings`, `own-report` and `submit`, and accept an `E<n>` round argument; verify the reviewer reads the extra brief, submits on the extra round and reads the extra own-report in `test/review-reviewer.test.mjs`.
- [x] 1.5 Resolve extra rounds for `self-report`, `report`, `dispose`, `waive` and `extend` in `lib/tools/review.js` through the same helper; verify self-report on `E1`, report lookup by token and a disposition with the token in `test/review-apply.test.mjs` and `test/review-waiver.test.mjs`.

## 2. Extra round flow

- [x] 2.1 In `lib/tools/review.js`, make apply `resume` open or reuse an extra round while `rebaseReview` is present, return the recorded brief without opening another round when the latest extra round is ready, and clear the marker only on the unchanged-tree fast path; verify `E1`, `E2`, reuse, ready-no-new-round, unchanged-tree clearing and a normal round after the marker clears in `test/review-apply.test.mjs`.
- [x] 2.2 Render the extra round token in the apply brief, report contract example and status `roundToken`/`extraRounds` projection, and make the reviewer wakeup name the token; verify in `test/review-apply.test.mjs` and `test/review-wakeup.test.mjs`.
- [x] 2.3 Make apply readiness select the latest extra round while the marker is present, keep the marker for an unready report and keep the open-finding gate; verify in `test/review-apply.test.mjs`.
- [x] 2.4 Write extra round cards with the numeric `seq` as the file name, top-level `round` and payload `round`, add `roundToken` to the payload, resolve `extraRounds` in `buildCard` and keep numeric ordering; verify the card is readable, the payload carries the token and timestamps and ordering uses the sequence in the plugin's card tests; the DSH client summary render is the documented visual check, not a plugin test.
- [x] 2.5 Document the extra round contract, marker clearing, ids and the card summary token display in `docs/review.md` and update the doc assertions in `test/review-doc.test.mjs`.

## 3. Land rebase marker and required tree

- [x] 3.1 Record `rebaseReview` on the apply record after the change-lock owner check and under the review-directory lock when land refuses a worktree behind main and apply review is enabled; write nothing when the review is disabled or absent and nothing when a foreign owner holds the change lock; verify all four cases in `test/worktree-land.test.mjs`.
- [x] 3.2 Resolve the land required tree in the agreed order: ready extra round tree, unchanged rebased tree with marker clearing, refusal without a ready extra round, then the existing tree; clear the marker under the review-directory lock at the end of the critical section after `finishLand` writes the manifest and the archived state, and keep the manifest `reviewRecordHash` as the hash of the record bytes `finishLand` read before the clear; verify the tree order, the end-of-land clearing, the land-time hash and that an archive, archive-commit or manifest failure keeps the marker so a retry resolves the extra round tree, in `test/worktree-land.test.mjs`.
- [x] 3.3 Document the marker, extra round gate and tree order in `docs/apply-worktree.md` and update `test/apply-worktree-doc.test.mjs`.

## 4. Land cleanup

- [x] 4.1 Admit optional `cleanup` in `lib/worktree/state.js` validation, keep every unknown field refused and read an old state without it; verify round-trip, legacy read and unknown-field refusal in `test/worktree-state.test.mjs`.
- [x] 4.2 In `lib/worktree/land.js`, remove the worktree and delete the local branch after `finishLand`, keep the archived state and manifest, and record `cleanup` flags; verify the directory, branch, state and manifest in `test/worktree-land.test.mjs`.
- [x] 4.3 Report a cleanup failure as `cleanup.complete: false` with `cleanup.error`, store the error and keep the archived state instead of rolling back; verify in `test/worktree-land.test.mjs`.
- [x] 4.4 Add the cleanup retry branch before the lock handover, worktree reads and clean/behind-main checks; retry only the cleanup, keep `archived`, don't merge or write a second manifest and treat an already removed checkout or branch as success; verify in `test/worktree-land.test.mjs`.
- [x] 4.5 Update `lib/tools/query.js` so the doctor reports `repair.action: "none"` for a cleaned archived state, `"cleanup"` for pending cleanup and a legacy archived checkout whose worktree still exists, and keeps `"manual"` for a hand-deleted checkout without cleanup; update the output schema enum and verify in `test/worktree-inspect.test.mjs`.
- [x] 4.6 Keep `remove` idempotent for an archived state whose cleanup already ran: succeed without deleting the state or failing when the checkout or branch is gone; verify in `test/worktree-land.test.mjs`.
- [x] 4.7 Document the cleanup, failure and retry behavior in `docs/apply-worktree.md` and update `test/apply-worktree-doc.test.mjs`.

## 5. Tool surface and workflow docs

- [x] 5.1 Change the `openspec_review` `round` parameter to accept a positive integer or `E<n>` and update the closed output schema with `roundToken` and `extraRounds`; `roundToken` is present only for an extra round and omitted for a normal round; draft rejects an extra token; verify in `test/review-draft.test.mjs`, `test/review-apply.test.mjs`, `test/descriptions.test.mjs` and the schema tests.
- [x] 5.2 Change the `openspec_reviewer` `round` parameter and output schema the same way, and add `roundToken` to extra round entries of the `findings` history while a normal entry omits it; verify in `test/review-reviewer.test.mjs` and `test/descriptions.test.mjs`.
- [x] 5.3 Add the land `cleanup` object to the `openspec_apply_worktree` result schema and description; verify in `test/worktree-land.test.mjs` and `test/descriptions.test.mjs`.
- [x] 5.4 Update `README.md`, `AGENTS.md`, the shipped apply/archive skills and `lib/policy.js` for extra rounds, marker clearing and land cleanup; verify with `test/policy.test.mjs`, `test/skills.test.mjs` and `test/projections.test.mjs`.

## 6. Integration

- [x] 6.1 Run `openspec_inspect` with `action: "validate"` and `strict: true` and fix every finding.
- [x] 6.2 Run `npm run test:affected` for the changed modules and fix every failure.
- [x] 6.3 Run `npm run verify` on Node 24 and fix every failure.
- [x] 6.4 Run `npm run openspec:check` and confirm the active change and main specs validate.

## Workflow follow-up

- Commit the implementation in the apply worktree and run apply review.
- Land with `openspec_apply_worktree action=land` after the user requests it; do not archive the worktree-applied change with `openspec_archive`.
