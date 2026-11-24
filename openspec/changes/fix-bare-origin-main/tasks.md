# Tasks

## 1. Read the remote main through its full ref

- [x] 1.1 Pass `refs/remotes/origin/main` to `rev-parse`, `merge-base`, `rebase` and `merge --ff-only` in the scripts and `lib/tools/review.js`.
- [x] 1.2 Make `refs/remotes/origin/main` the default base of the coverage gate, its entrypoints and the coverage stamp.

## 2. Align the specs and the quoted command

- [x] 2.1 Replace the bare short name in the coverage-gate, change-review and tool-surface requirements and add the shadowing scenario to coverage-gate and development-workflow.
- [x] 2.2 Update the apply review brief, the `base` description and `CONTRIBUTING.md`.

## 3. Guard the behavior

- [x] 3.1 Add a same-named local branch to the push-landed, coverage stamp, pr-review-land and apply review fixtures and assert the tracking ref wins.
- [x] 3.2 Confirm the new assertions fail with the implementation reverted.

## 4. Verify

- [x] 4.1 Run `openspec validate fix-bare-origin-main --strict`, `npm run openspec:check`, `node scripts/check-requirement-length.mjs`, `node scripts/check-generated-skills.mjs --base refs/remotes/origin/main` and `node scripts/check-pr-change.mjs --base refs/remotes/origin/main`.
- [x] 4.2 Run `npm run verify`.
