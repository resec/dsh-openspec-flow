# Tasks

## 1. Landed-range guard

- [x] 1.1 Add `scripts/landed-push-guard.mjs` with manifest/archive/land maps, local `landed-offline` phase lookup, offline-record lookup and a classifier that checks manifest land commits in `base..tip` while letting plain reviewed commits pass; verify with `node --test test/landed-push-guard.test.mjs` covering merged, direct, multi-commit offline, missing-flag, earlier-direct-land and mixed non-worktree cases
- [x] 1.2 Refactor `scripts/push-landed.mjs` to call the guard after `fetchRemoteMain` but before its dry-run/push decision, and add the `--offline` parse and usage text; verify the dry run and push both refuse a direct land with `node --test test/push-landed.test.mjs`
- [x] 1.3 Change the `push-landed` online fixture so its land commit is already on `origin/main`, and add a direct-land fixture that reproduces the 11-commit push and asserts `origin/main` is unchanged; verify with `node --test test/push-landed.test.mjs`
- [x] 1.4 Document the range gate, `--offline`, the direct-land refusal and the recovery path in `docs/land-push.md`, and verify the prose matches the tested behavior with `node --test test/land-push-doc.test.mjs`

## 2. Offline land record

- [x] 2.1 Add `scripts/offline-land.mjs` with `record`, verifying the selected manifest, `main` HEAD, archive commit, reviewed tree and user approval before writing `.cache/pr-review/offline-lands.json`; verify with `node --test test/offline-land.test.mjs` covering record, matching, mismatch and stale land
- [x] 2.2 Make `push-landed --offline` accept a matching offline record or an existing `landed-offline` local phase, refuse the flag without either, and remove the matching record after a successful deferred push; verify with `node --test test/push-landed.test.mjs` and `node --test test/offline-land.test.mjs`
- [x] 2.3 Update `OFFLINE_LAND_COMMAND`, `docs/local-pr.md`, `docs/pr-review.md`, `AGENTS.md` and the offline completion section of `docs/land-push.md` to the lab → land → `offline-land record` → stop sequence and the `push-landed --push --offline` recovery, with the record removed after the push; move the pinned `AGENTS.md` assertion in `test/contributor-docs.test.mjs` to the new command; verify with `node --test test/local-pr-doc.test.mjs test/contributor-docs.test.mjs test/review-doc.test.mjs test/land-push-doc.test.mjs test/pr-publish.test.mjs test/pr-review-watch.test.mjs`
- [x] 2.4 Document that a published but unmerged pull request may keep `pr-local-land finish --phase landed-offline` and is accepted by the same gate; verify with `node --test test/local-pr-doc.test.mjs`
- [x] 2.5 Add `test/offline-push-spec.test.mjs` asserting the `pr-review-pipeline` offline requirements name the offline record and `push-landed --push --offline`, reading the delta before archive and the main spec afterwards; verify with `node --test test/offline-push-spec.test.mjs`
- [x] 2.6 Update the local-main-ahead refusal messages in `scripts/pr-publish.mjs`, `scripts/pr-review-land.mjs` and `scripts/pr-local-land.mjs` to name `--push` with `--offline` for a recorded offline land; verify with `node --test test/pr-publish.test.mjs test/pr-review-land.test.mjs test/pr-local-land.test.mjs` and an assertion that each message names `--offline`

## 3. Pre-push range check

- [x] 3.1 Add `scripts/check-main-push.mjs` that applies the guard to the Git-supplied `remote_sha..local_sha` range, allows a range with no manifest-backed commit, and requires the `push-landed --offline` marker for an offline range; verify with `node --test test/check-main-push.test.mjs` covering merged, direct, raw offline, marked offline, non-worktree, mixed-push and delete cases
- [x] 3.2 Call the check from `.githooks/pre-push` for a push that includes `refs/heads/main`, after artifact validation and before the coverage step, capturing the main line's SHA pair inside the loop and passing it explicitly so a mixed push uses the main pair; update the installer message; verify with `node --test test/hooks.test.mjs` including the new call order, a mixed push and a failing direct land
- [x] 3.3 Document the pre-push range check and the direct-land refusal in `docs/land-push.md`, and verify with `node --test test/land-push-doc.test.mjs`

## 4. Integration verification

- [x] 4.1 Run `node --test test/landed-push-guard.test.mjs test/push-landed.test.mjs test/offline-land.test.mjs test/check-main-push.test.mjs test/hooks.test.mjs test/offline-push-spec.test.mjs test/land-push-doc.test.mjs test/local-pr-doc.test.mjs`, and verify every new failure mode is covered
- [x] 4.2 Run `npm run check:requirement-length`, `openspec_inspect action=validate strict=true` for the change, and `npm run verify` on Node 24; verify all pass and the coverage report has no violation
- [x] 4.3 Replay a direct land, an online merge and a recorded offline land against a temporary repository; verify direct land is refused with `origin/main` unchanged, online lands push only the archive commit, and the recorded offline land pushes only with `--offline`

## Workflow follow-up

- Run the apply review on the committed worktree and fix every blocker.
- Publish the change as a pull request with `pr-publish`, wait for green CI, merge with `gh pr merge --rebase`, verify and retarget, then land.
- Push the archive commit with `push-landed`; the change's own land commit is the merge commit already on `origin/main`, so the new gate must allow it.
- Record `finish --phase pushed`, archive, and verify the final main.
