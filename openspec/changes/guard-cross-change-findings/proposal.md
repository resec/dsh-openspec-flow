# Proposal: Guard review findings against another change

## Why

A reviewer of one change can read the whole workspace and submit a finding whose location is another change's directory under `openspec/changes/`. Nothing rejects that finding, and a critical or major one cannot be deferred or rejected, so the changer is pushed to edit artifacts that belong to a change that may be in draft; the landed stale-round watch then only records the damage as a blocked round. The briefs do not state the boundary, and the flow rule does not tell reviewers to keep out of another change's planning material.

## What Changes

- A report is refused when a new finding's `location` resolves under another change's directory under `openspec/changes/`, including `openspec/changes/archive/`. The refusal names the finding and instructs the reviewer to record the concern in `outOfScope`; `outOfScope` entries stay accepted. The check covers draft and apply reports from self-review and independent reviewers.
- The draft and apply briefs state that another change's directory is outside the review scope even when it appears in the reviewed tree or workspace, and that a finding requiring it to change is refused.
- The flow rule states that a reviewer must not require changes to another change's artifacts or edits to a change whose draft round has no report, and that such a concern belongs in `outOfScope`; the existing no-edit rule for the changer stays.
- No land gate and no change to the apply object: the demand is refused where it is recorded, not by a later path check.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `change-review`: new finding locations are scoped; both briefs state the cross-change boundary.
- `flow-policy`: the rule states the reviewer boundary and keeps the changer's no-edit rule.
- `review-documentation`: the review document states the boundary and the refusal.

## Impact

- `lib/review/scope.js` (new): locate another change's directory in a finding location.
- `lib/review/report.js` and `lib/review/submit.js`: refuse the report before it is stored.
- `lib/review/brief.js`: one rule line in both briefs.
- `lib/policy.js`: the flow rule text.
- `docs/review.md`: the boundary and the refusal behavior.
- Tests for the parser, the report refusal in both reviewer modes, the brief lines, the rule text and the document.
- No new dependency. No review-record schema change: the recorded change name scopes a new report, and a record without one keeps the previous behavior.
