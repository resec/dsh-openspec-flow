# Proposal

## Why

`abandon` writes `state: "abandoned"` and reports that the review is closed, and `resume` refuses that record. Nothing else did: a finding `dispose` or `waive`, a reviewer `submit` and `waive-reviewer` recomputed the state from readiness and wrote `in-review` back, after which `resume` opened another round. `retry`, `replace` and `extend` still wrote the abandoned record, and `replace` started a reviewer for a review nobody is waiting on.

## What Changes

- Refuse a finding `dispose` or `waive`, `self-report`, `retry`, `replace`, `waive-reviewer` and `extend` on an abandoned draft or apply record, and refuse an `openspec_reviewer` `submit` on it.
- Use one error for these refusals: it names the review kind, states that the review was abandoned and names the recovery `resume` already gives. The existing `self-report` refusal gains that recovery.
- Assert for both review kinds that the record's bytes do not change, no reviewer is messaged or started, and `resume` still refuses.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `change-review`: the delta adds the requirement "An abandoned review stays abandoned". The main spec only requires `resume` to refuse an abandoned review; the dispositions and submit requirements sit at the 500-character description limit, so the contract is added as one requirement instead of growing them.

## Impact

- `lib/tools/review.js`: one shared assertion, used by the seven changer actions.
- `lib/review/reviewer-tool.js`: the submit path.
- `test/review-draft.test.mjs`, `test/review-apply.test.mjs`, `test/review-reviewer.test.mjs`: four cases over both kinds and both reviewer modes.
- `docs/review.md`: the abandoned-review row of the failure handling.
- Read actions (`status`, `report`, `wait`, the reviewer `read`) are unchanged.
