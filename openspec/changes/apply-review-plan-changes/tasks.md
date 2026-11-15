# Tasks: apply-review-plan-changes

## 1. Seal the draft in git projects

- [ ] 1.1 Add `gitCommitPaths(root, rev)` to `lib/review/store.js` and a unit test covering a normal commit, the initial commit and a merge commit.
- [ ] 1.2 Extend `assertDraftReviewReady` with the clean-tree, change-directory-only (allowing `openspec/.gitignore`), non-empty and artifact-hash checks, record `applyBaseCommit`, and skip the checks with a warning for a store-backed change whose directory is outside the project root; test the accepted seal.
- [ ] 1.3 Test the dirty-tree, mixed-commit, empty-commit, `.gitignore`-only and hash-mismatch refusals, the `openspec/.gitignore` allowance, the no-git skip and the store-backed skip warning.

## 2. Freeze the draft after apply

- [ ] 2.1 Add an "apply started" helper that reads the apply base or the apply review record in `lib/tools/review.js`.
- [ ] 2.2 Refuse `resume` with `review: "draft"` once apply started; test both sides of the boundary.
- [ ] 2.3 Add `ignoreStale` to `draftReadiness` and pass it from `assertDraftReviewReady` and the draft status projection; test an apply re-sync after a plan change.
- [ ] 2.4 Point the draft next action at the apply review after apply started; test the status output.

## 3. Cover plan changes in apply review

- [ ] 3.1 Add `diffArtifactFiles(before, after)` to `lib/review/object.js` with unit tests for modified, added and removed files.
- [ ] 3.2 Record `draftDrift` on apply start and resume instead of refusing; test a start and a resume after a design change.
- [ ] 3.3 Add the plan-change section, the waiver section, the plan axes and the intent path to `buildApplyBrief`; test the brief.
- [ ] 3.4 Replace the "applied tree changed the plan" refusal test with the accepted-drift test.

## 4. Plan-change waiver

- [ ] 4.1 Add the `scope: "plan-change"` branch to `waive` that requires apply started, a non-empty `files` list and writes `plan-change-waiver.json`; test recording, the before-apply refusal and the pre-first-round path.
- [ ] 4.2 Refuse a drift file outside the waiver file set; test the refusal and the merged-set path.

## 5. Documentation and policy

- [ ] 5.1 Update `docs/review.md` and `README.md` with the seal, the draft freeze, the waiver and the plan axes.
- [ ] 5.2 Update `skills/openspec-apply-change/SKILL.md` with the seal (change directory plus `openspec/.gitignore` when the plugin writes it), the per-round commit and the waiver steps.
- [ ] 5.3 Update the flow rule text in `lib/policy.js` and `AGENTS.md`, and add an assertion per new sentence to `test/policy.test.mjs`.
- [ ] 5.4 Update the documentation test expectations in `test/review-doc.test.mjs`, including the `plan-change-waiver.json` record and the seal wording.

## 6. Verification

- [ ] 6.1 `openspec_inspect` with `action: "validate"` and `strict: true` passes.
- [ ] 6.2 `npm test` passes on Node 24.
- [ ] 6.3 `npm run coverage:check` passes.
