# Proposal

## Why

The `remote ahead, diverged and missing main are refused` test builds its bare remote with `git init --bare`, so the remote's `HEAD` follows the host's `init.defaultBranch`. On a host that defaults to `main`, `git push origin --delete main` is refused as deleting the current branch and the test fails before the missing-main scenario runs; on CI the default branch differs, so the failure is invisible there.

## What Changes

- After creating the bare remote, point its `HEAD` at `refs/heads/trunk`, a branch the test never pushes.
- Keep the scenario untouched: the remote still loses `main`, and the script is expected to report that it cannot fetch it.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. Only the test fixture changes, so this change sets `skip_specs: true`.

## Impact

- `test/push-landed.test.mjs`: one line plus a comment.
- No product code, dependency, workflow, hook, coverage-baseline or `dist/` change.
