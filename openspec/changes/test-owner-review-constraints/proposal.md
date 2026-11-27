# Proposal

## Why

Three constraints of the advisory `owner-review` automation were unguarded. Writing the `mergeable` label from the same code path, dropping `BLOCKED` from the conflicting merge states, and replacing the trusted pass with any pass comment left every test green. The landing side also lacked a direct case for a pull request that carries `owner-review` but not `mergeable`.

## What Changes

- Record every `pr edit` call in a fake `gh` and assert that an add and a remove write only `owner-review`, with no `--add-label mergeable` or `--remove-label mergeable` in either direction.
- Add a `mergeStateStatus: BLOCKED` rejection case, with and without the advisory label.
- Add cases for a pass comment on an older head and a pass comment written by another author, both refused.
- Add a landing case for a pull request that carries `owner-review` but not `mergeable`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The `pr-review-pipeline` spec already requires all four behaviors: the advisory label scenario says the authorization label is untouched, the eligibility requirement names `BLOCKED` and a trusted pass for the current head, and the signal scenario says `owner-review` alone does not authorize landing. Only the tests were missing, so this change sets `skip_specs: true`.

## Impact

- `test/pr-review-owner-review.test.mjs`: three new tests plus a `MERGEABLE_LABEL` import.
- `test/pr-review-land.test.mjs`: one assertion in the plan refusal test and an `OWNER_REVIEW_LABEL` import.
- No script, dependency, workflow, hook, coverage-baseline or `dist/` change.
