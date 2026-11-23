# Proposal

## Why

The shipped flow rule tells the agent to call `openspec_review` with `action: "resume"`, `action: "self-report"` and `action: "wait"` for the apply review without `review: "apply"`. The tool defaults an absent kind to `draft`, so the documented apply loop addresses the draft record: the second apply round is refused as a frozen draft review, and archive is then refused for an unready apply review.

## What Changes

- In the apply paragraph of the flow rule, name `review: "apply"` on `resume`, `self-report` and `wait`, and repeat the worktree path on `resume`.
- In the draft paragraph, name `review: "draft"` on the same three actions so no step depends on the default.
- Add a test that fails when a review action in either paragraph has no kind in its own clause.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The rule text is corrected to name each review kind instead of relying on the tool's default; no requirement changes, so this change sets `skip_specs: true`.

## Impact

- `lib/policy.js`: `POLICY_TEXT` items 4 and 6.
- `test/policy.test.mjs`: one new test.
- No tool contract, dependency, workflow, hook, coverage-baseline or `dist/` change.
