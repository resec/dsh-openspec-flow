# Proposal

## Why

`test/pr-review-land.test.mjs` refuses a missing label, a non-main base, a red rollup, a stale head and an untrusted review, but the remaining landing gates have no assertion: a closed or draft pull request, a non-`MERGEABLE` `mergeable`, the `DIRTY`/`CONFLICTING`/`BLOCKED` merge state, and the `gh pr merge` arguments themselves. The fake gh ignores the merge arguments, so deleting those checks or adding `--admin` left the whole file green.

## What Changes

- Record every fake-gh invocation and expose the `pr merge` argument lists to the tests.
- Add a matrix case per landing gate, run through both `plan`/`prepare` and the `merge` re-check, asserting the refusal message, that no merge was attempted and that the landing phase is unchanged.
- Assert the success path calls `gh pr merge <n> --rebase` exactly once, with no `--admin`, `--squash`, `--merge` or `--force`.
- Cover the `prepare` single-landing guard and the `reviewed`, `archive` and `finish` re-checks of the recorded heads.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. `pr-review-pipeline` already requires these gates in "Landing authorization" and "Rebase merge and merged-tree check"; only the tests were missing, so this change sets `skip_specs: true`.

## Impact

- `test/pr-review-land.test.mjs`: the fake gh recorder and seven new cases.
- No production, spec, documentation, dependency, workflow, hook, coverage-baseline or `dist/` change.
