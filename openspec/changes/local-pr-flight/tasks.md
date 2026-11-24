# Tasks

## 1. Local owner state and preflight

- [ ] 1.1 Add the `<main worktree>/.cache/pr-review/local-prs.json` schema with the number, change, branch, head, tree, review record, owner session id and phase, plus read/write helpers, phase-aware cleanup and corrupt-state refusal to `scripts/pr-review-watch.mjs`; verify all eight fields, the retained unfinished phases, the removed completed phases and the corrupt refusal in `test/pr-review-watch.test.mjs`.
- [ ] 1.2 Create `scripts/pr-review-lock.mjs` resolving `<main worktree>/.cache/pr-review/landing.lock` with `status`, `acquire --owner-session`, `release --owner-session --token` and `force-release`, create `test/pr-review-lock.test.mjs`, and verify mutual exclusion, owner session and token matching, another-owner refusal, stale reporting, main-worktree resolution and explicit release.
- [ ] 1.3 Add the read-only `preflight` command reporting GitHub reachability, local `main` versus `origin/main`, unfinished landings and lock ownership; verify online, offline, unpushed-main and held-lock outputs in `test/pr-review-watch.test.mjs`.
- [ ] 1.4 Create `docs/local-pr.md` with the state, lock and preflight sections, add it to the README documentation list, and add the state-file and lock entries to `docs/pr-review.md`; verify the documented paths and commands with a documentation assertion test.

## 2. Local pull-request publication

- [ ] 2.1 Create `scripts/pr-publish.mjs` with dry-run gates for the plugin worktree, passed review tree, clean worktree, main planning copy, local main versus `origin/main`, GitHub reachability, unfinished landing, and a lock held by another session versus the local entry's own session and token; create `test/pr-publish.test.mjs` and verify each refusal and the owner-token match.
- [ ] 2.2 Add the `--apply` effects to the publish script and the test file created by task 2.1: branch push, draft pull request with the audit marker, local owner entry, ready marking, repeated-run reuse and closed-PR refusal; verify with a local bare origin and fake `gh`.
- [ ] 2.3 Add the `pr:publish` package entry and document the publish commands, audit marker and no-label rule in `docs/local-pr.md`; verify the documented commands with a documentation assertion test.

## 3. Retarget and land

- [ ] 3.1 Create `scripts/pr-local-land.mjs` with `status`, `retarget`, `verify`, `finish` and `recover` (including the `openspec_apply_worktree action=recover` step for a dead change lock), create `test/pr-local-land.test.mjs`, and verify PR merged, `origin/main` is the merge commit, the merge tree equals the review tree, the worktree is clean and local main is an ancestor before resetting; verify each refusal, the successful reset, the owner session and token, and the `landed-offline`/`pushed` phases recorded by `finish`.
- [ ] 3.2 Create `test/local-pr-retarget.test.mjs`: create a reviewed worktree, simulate a rebase-merge commit, retarget, run `openspec_apply_worktree land`, verify the archive commit, manifest and `push-landed --push` range, and verify the no-retarget divergence refusal.
- [ ] 3.3 Document the online completion path (merge, retarget, land, archive push), the behind-head rebase/verify/resume/push sequence and the recovery in `docs/local-pr.md` and `docs/land-push.md`; verify the commands and refusal messages with a documentation assertion test.

## 4. Patrol classification and scheduling

- [ ] 4.1 Exclude local pull requests from `poll`, `prepare`, `comment`, owner-review reconciliation and landing candidates; verify exclusion, corrupt-state refusal and cleanup in `test/pr-review-watch.test.mjs` and `test/pr-review-owner-review.test.mjs`.
- [ ] 4.2 Add landing-lock checks to the contributor landing commands and make a ready contributor landing merge, archive, push and finish in one locked run; verify the lock refusal, same-run completion and existing contributor behavior in `test/pr-review-land.test.mjs`.
- [ ] 4.3 Update the scheduled session prompt and `docs/pr-review.md` for strict contributor ordering, local exclusion, the landing lock and same-run completion; verify the documented sequence with a documentation assertion test.

## 5. Offline completion

- [ ] 5.1 Route `pr-publish` and `preflight` to `offline-land` when GitHub is unreachable; verify no branch, PR or state write and the reported command in the publish test file created by task 2.1 and `test/pr-review-watch.test.mjs`.
- [ ] 5.2 Refuse a new online pull request and contributor landing while local `main` leads `origin/main`; verify the refusal and `push-landed` guidance in the publish test file created by task 2.1, `test/pr-review-land.test.mjs` and `test/pr-review-watch.test.mjs`.
- [ ] 5.3 Document the offline path, local lab requirement, `landed-offline`/`pushed` phases recorded through `pr-local-land finish`, deferred push and open-PR reconciliation in `docs/local-pr.md` and `docs/land-push.md`; verify with a documentation assertion test.

## 6. Pre-push lab removal

- [ ] 6.1 Remove the lab step from `.githooks/pre-push` and update the installer message; verify the hook no longer invokes the lab, still runs strict validation and the coverage decision, and still blocks on validation or verification failure in `test/hooks.test.mjs`.
- [ ] 6.2 Update `docs/lab.md`, `README.md` and `AGENTS.md` to name the remote `lab` job as the guard and the offline lab as the offline requirement, keeping the offline `npm run test:lab -- --mock-only` phrase; verify the documented text with `test/lab-doc.test.mjs` and the AGENTS documentation assertions.

- [ ] 6.3 Update `AGENTS.md` step 7 with the online publish, retarget, land and archive-push path and the offline land and deferred-push path; add the online, retarget and offline assertions to `test/contributor-docs.test.mjs` and verify they pass.

## 7. Integration verification

- [ ] 7.1 Run `npm run test:affected --` over the touched scripts, hook and docs, and verify the selected tests pass on Node 24.
- [ ] 7.2 Run `npm run openspec:check` and `openspec_inspect` with `action: "validate"` and `strict: true`; verify no findings.
- [ ] 7.3 Run `npm run verify` on Node 24 with a writable npm cache; verify the test summary and coverage verdict pass.
- [ ] 7.4 Run `npm run test:lab -- --mock-only`; verify the reusable scenarios pass before completion.
- [ ] 7.5 Review the final diff for scope, no plugin runtime changes and no review-local identifiers; verify each commit addresses one change.

## Workflow follow-up

- Commit the implementation in the apply worktree before the apply review.
- Complete the apply review, then land the change with the existing land path because the new flow is not yet installed.
- Archive the change and push the archive commit with `push-landed`.
