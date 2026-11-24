# Tasks

## 1. Sync command

- [ ] 1.1 Extend the pull-request projection read by `scripts/pr-review-land.mjs` with `isCrossRepository` and `headRefName`, and verify the existing landing tests still pass
- [ ] 1.2 Add `sync <n> [--apply]` with the eligibility and effects the specs define: open, non-draft, `main` base, one active change, `mergeable`, same-repository, behind the fetched `origin/main`, no open landing, conflict-free; dry run by default, run under the run lock
- [ ] 1.3 Call GitHub's update-branch API with `expected_head_sha`, poll for the new head, record `syncs[<n>] = { previousHead, newHead, at }` in the landing state without a landing entry, and verify a successful update leaves `mergeable`, comments and fork branches untouched
- [ ] 1.4 Cover `sync` with fake gh/git tests: eligible update, fork refusal, missing label, conflict/stale-head rejection, open landing, dry run, recorded heads, and no state change on refusal

## 2. Candidate classification and owner-review

- [ ] 2.1 Report `behind` and `sameRepository` for every landing candidate, mark a behind same-repository entry `syncable`, and refuse a behind fork entry with an author-update reason
- [ ] 2.2 Test the listing against behind same-repository, behind fork, not-behind and non-eligible pull requests, and verify the listing still writes no state
- [ ] 2.3 Test that a head change removes `owner-review` and that it is not re-added while `mergeable` is present, and verify the reconcile output is unchanged

## 3. Latest-main gates and merge failures

- [ ] 3.1 In `plan` and `prepare`, fetch `origin/main` and require the pull-request head to contain it; a same-repository head names the sync command, a fork head names the author update, and a refusal creates no landing entry
- [ ] 3.2 In `merge`, fetch `origin/main` and the pull-request ref, require the recorded pre-merge main to be unchanged and contained in the head, and write `phase: failed` before refusing when either check fails
- [ ] 3.3 Replace the two prepare-rebase tests with tests for the latest-main refusals and the current-head landing branch, and verify the full landing test file passes
- [ ] 3.4 Test the merge failure records `failed` for a moved main and a stale head, verify no `gh pr merge` call is made, and verify a successful merge when the head contains main

## 4. Documentation and schedule prompt

- [ ] 4.1 Document the `sync` command, the same-repository restriction, the fork author-update path, the latest-main gates, the merge failure record and the compressed final stage in `docs/pr-review.md`, rewrite its non-goals so only fork-branch updates are prohibited and merge commits are prohibited on `main`, and verify the documentation tests
- [ ] 4.2 Update the `AGENTS.md` pull-request loop paragraph to permit the labeled same-repository sync while prohibiting fork-branch updates, force, squash and merge commits on `main`, and verify the documentation tests
- [ ] 4.3 Update the `CONTRIBUTING.md` landing paragraph so the final review runs on the current pull-request head rather than a rebased landing branch, and verify the documentation tests
- [ ] 4.4 Update the scheduled prompt text in `docs/pr-review.md` to pick a syncable candidate for `sync` before `prepare`, to describe the synced head waiting for green CI, and to run `reviewed` then `merge` in the same run when the final review is ready while leaving archive and push to a later run; replace its blanket "do not modify PR code or the contributor branch" and "create a merge commit" lines with fork-branch and `main`-only wording so the prompt permits the authorized sync

## 5. Integration checks

- [ ] 5.1 Run `openspec_inspect` with `action: "validate"` and `strict: true` and verify zero issues
- [ ] 5.2 Run `npm run check:requirement-length -- --change sync-behind-owner-branch` and verify it reports `ok`
- [ ] 5.3 Run `npm run verify` on Node 24 and verify the test suite and coverage gate pass

## Workflow follow-up

- Commit the implementation, run the apply review, and archive the change.
- Land and push to `origin/main`.
- After landing, update the scheduled task prompt to the text documented in `docs/pr-review.md`.
- Validate the live behavior on one behind same-repository pull request: run `sync <n> --apply`, confirm the new head is reviewed by the watch once CI is green, and confirm the final rebase merge succeeds with a merged tree equal to the reviewed tree.
