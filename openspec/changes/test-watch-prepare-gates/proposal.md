# Proposal

## Why

`preparePullRequest` refuses a PR that is closed, a draft, not green, or not changing exactly one active change. Every prepare test called `prJson()` with the eligible defaults, so deleting any of those four guards left the watch suite green: the guards were unguarded. The mixed poll test also covered drafts, an empty rollup and two changes, but not a failed or pending check, and it asserted only the candidate number and change, not the fields the poll requirement names.

## What Changes

- Let `prJson()` take arbitrary overrides and add one prepare-refusal test per gate: closed, draft, failed or pending CI, and zero or two active changes. Each asserts the error text and that no `pr-12` worktree exists.
- Rename the mixed filter test to the spec scenario and add a failed-check and a pending-check PR; assert the whole eligible candidate object, including `baseRefOid`, `baseRefName`, `worktree`, `status` and `resume`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The poll requirement already filters drafts, failed and pending checks, empty rollups and multiple changes and names every candidate field, and the preparation requirement scopes preparation to a candidate PR. Only the tests were missing, so `.openspec.yaml` sets `skip_specs: true`.

## Impact

- `test/pr-review-watch.test.mjs`: the `prJson` helper, one rewritten filter test and four prepare-refusal tests.
- No script, spec, document, dependency, workflow, hook, coverage-baseline or `dist/` change.
