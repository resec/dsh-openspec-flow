# Compare the change check with the pull-request head

## Why

Pull-request CI checks out the merge ref, so `HEAD` is a merge commit of the current base branch and the pull request. The change check runs `git diff <pull_request.base.sha>...HEAD`; when the base branch advanced after the pull request opened, `base.sha` is the older recorded base and every main-branch commit since then appears in that diff. The check then reports restricted paths that the pull request never touched: a reopened pull request currently fails with `restricted path changed: openspec/changes/archive/...` and `.../ci.yml`.

The failure lands before strict validation and the requirement-length gate, so the author sees a misleading restriction error instead of the real problem, and the later gates never run. The same mismatch affects the dependency check: it compares the base `package.json` with the working-tree copy of the merge commit, so a `package.json` change that landed on main can be reported as a dependency change the pull request never made.

## What Changes

- Add `--head <sha>` to `scripts/check-pr-change.mjs` and compute the changed paths with `git diff <base>...<head>` instead of `...HEAD`.
- Pass `${{ github.event.pull_request.head.sha }}` from the CI step.
- Read the head `package.json` from the head revision so the merge tree is not an input, and fail the step when that revision cannot be read.
- Cover the advanced-base and merge-checkout cases, the usage and exit codes, and the CI argument in the script and workflow tests, and state the comparison in the CI description.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `contributor-workflow`: a new requirement states that the change check compares the pull-request base with the pull-request head, so base-branch commits that land after the pull request opens are not counted as pull-request changes, while a restricted path the pull request really changes still fails.

## Impact

- Changed code: `scripts/check-pr-change.mjs`, `.github/workflows/ci.yml` (one argument), `test/check-pr-change.test.mjs`, `test/ci-workflow.test.mjs`.
- Changed documentation: the CI description in `AGENTS.md`.
- No change to the restricted-path list, the task checks or the existing exit-code meanings.
