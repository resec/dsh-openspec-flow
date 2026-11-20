# Tasks

## 1. Push compatibility

- [x] 1.1 Resolve the landed commit in `scripts/push-landed.mjs` from `landCommit ?? mergeCommit`, reject conflicting values, add `--land` with `--merge` as an alias, and report the resolved commit as `land`; verify with the selection and validation cases in `test/push-landed.test.mjs`.
- [x] 1.2 Add a fast-forward manifest fixture, a legacy `mergeCommit`-only fixture, coverage for both selectors, and a conflicting two-field manifest case; verify `node --test test/push-landed.test.mjs`.
- [x] 1.3 Update `docs/land-push.md` for `--land`, the legacy alias, `landCommit` fallback and recovery wording, and extend `test/land-push-doc.test.mjs` with assertions for `--land`, `--merge`, `landCommit`, `mergeCommit` and fast-forward; verify `node --test test/land-push-doc.test.mjs`.

## 2. Fast-forward land

- [x] 2.1 Add the linear-history check, require the feature tree before the update, replace `--no-ff` with `--ff-only`, and replace the resetting tree guard with a read-only assertion; verify the fast-forward, non-linear and tree-mismatch cases in `test/worktree-land.test.mjs`.
- [x] 2.2 Re-read main after the lifecycle and fresh change locks, refuse a moved main with the rebase marker, `active` state and the fresh lock token/pid, and preserve a post-recheck seal commit when the fast-forward fails; verify the recheck and race cases in `test/worktree-land.test.mjs`.
- [x] 2.3 Write `landCommit`, `landMode` and `<landCommit>.json`, return the `landCommit` plus deprecated alias, and replace `findMerge` with `findLanding` covering fast-forward, archive and legacy merge recovery; verify the success, archive-retry, manifest-retry, cleanup-retry and legacy-manifest cases in `test/worktree-land.test.mjs`.
- [x] 2.4 Declare `landCommit` in the `openspec_apply_worktree` result schema while keeping the deprecated `mergeCommit` alias; verify the schema and description cases in `test/descriptions.test.mjs` and `test/worktree-inspect.test.mjs`.
- [x] 2.5 Update `docs/apply-worktree.md`, `README.md`, `AGENTS.md`, `docs/review.md`, `skills/openspec-apply-change/SKILL.md` and `skills/openspec-archive-change/SKILL.md` for fast-forward land, linear feature histories, `landCommit` and the no-rewind behavior; extend `test/apply-worktree-doc.test.mjs` and `test/land-push-doc.test.mjs` with fast-forward, `landCommit`, linear-history and no-reset assertions.
- [x] 2.6 Update the registered flow rule in `lib/policy.js` to say land fast-forwards, archives and commits, and assert the wording in `test/policy.test.mjs`.

## 3. Integration

- [x] 3.1 Run `openspec_inspect` with `action: "validate"` and `strict: true` for the change and fix every finding.
- [x] 3.2 Run `npm run verify` on Node 24 and fix every test or coverage failure.
- [x] 3.3 Confirm the built-in fixture land leaves a linear main with one land commit and one archive commit, and confirm a legacy manifest still passes the push dry run.

## Workflow follow-up

- Commit the implementation, run apply review, complete any rebase extra round, archive, and run `node scripts/push-landed.mjs --push`.
