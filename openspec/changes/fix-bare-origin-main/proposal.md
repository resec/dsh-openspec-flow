# Proposal

## Why

The coverage gate, the coverage stamp, `scripts/push-landed.mjs`, `scripts/pr-review-land.mjs` and the apply review's base fallback name `origin/main` as a bare short name. Git resolves a short name to `refs/heads/<name>` before `refs/remotes/<name>`, so a local branch called `origin/main` shadows the remote-tracking ref and does not trigger the ambiguous-ref failure. Test fixtures that leak such a branch leave every script reading a local commit while reporting it as the remote state: push-landed prints `already pushed; nothing to do` and exits 0 while the remote is behind, and the new-code coverage range grows to dozens of commits.

## What Changes

- Resolve `origin/main` through `refs/remotes/origin/main` wherever git reads it as a ref: `rev-parse`, `merge-base`, `rebase` and `merge --ff-only`, plus the default base of the coverage gate.
- State the full ref in the specs that wrote the bare short name as the command, and add a scenario for a same-named local branch to the landed-push and new-code coverage requirements.
- Update the apply review brief, the `base` parameter description and `CONTRIBUTING.md`, which quote that command.
- Keep `git fetch origin main`, report labels, error messages and documentation that name the remote or its branch.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `coverage-gate`: the new-code merge base is computed from `refs/remotes/origin/main`, and a same-named local branch is ignored.
- `development-workflow`: the landed push decides on `refs/remotes/origin/main` even when a local branch has that short name.
- `change-review`: the apply review's base fallback is `git merge-base HEAD refs/remotes/origin/main`.
- `tool-surface`: the `base` fallback of `openspec_review` names the full ref.

## Impact

- `scripts/coverage-gate.mjs`, `scripts/coverage.mjs`, `scripts/coverage-stamp.mjs`, `scripts/push-landed.mjs`, `scripts/pr-review-land.mjs`, `lib/tools/review.js`: the ref name passed to git.
- `lib/review/brief.js`, `CONTRIBUTING.md`: the quoted command.
- Tests: shadowing fixtures for push-landed, the coverage stamp, pr-review-land and the apply review; the two fixtures that used a local `origin/main` branch as the remote now write the tracking ref.
- No decision logic, dependency, workflow, hook, coverage baseline or `dist/` change.
