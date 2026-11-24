# Proposal

## Why

`candidates` checks the `mergeable` label before it checks the pull request's own landing phase. When the maintainer removes the label from a pull request whose landing is in `review-failed`, the refusal reads `PR #12 has no mergeable label` and the recorded failure is never reported. The entry and the landing checkout stay behind, and `assertSingleLanding` refuses every other prepare with `PR #12 is already landing in phase review-failed`, so one cleared authorization blocks the whole landing queue until an operator reads `landings.json` by hand.

The pipeline spec already covers this: "Own landing recorded review-failed" requires `candidates` to report the recorded failure, and "A pre-merge landing is abandoned" requires the landing to be abandonable. Only the listing implementation lags.

## What Changes

- In `listLandingCandidates`, read the pull request's own landing entry before the label gate, and report the `review-failed` reason for that phase regardless of the label. When the label is also gone, the same reason names the missing label and the `abandon <n> --apply` command that clears the entry and its checkout.
- Extend `docs/pr-review.md`: the label-removal recovery step now says the refusal carries the recorded failure and the clearing command.
- Tests: an unlabeled `review-failed` landing is refused with its failure, the missing label and the command; running that command removes the entry and the checkout; a second pull request's `prepare` is refused while the entry exists and succeeds after the command.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. `pr-review-pipeline` already requires `candidates` to report the recorded failure for a pull request whose own landing is `review-failed`, and already makes a pre-merge landing abandonable, so this change sets `skip_specs: true`. The listing had a label gate in front of that requirement; the new reason text and the printed command only make the existing contract usable.

## Impact

- `scripts/pr-review-land.mjs`: the candidate loop's ordering and the `review-failed` refusal text.
- `docs/pr-review.md`: the Review-failed recovery step for label removal.
- `test/pr-review-land.test.mjs`: new listing, recovery and unblocking assertions.
- No label write, state schema, watch, archive, dependency, workflow, hook, coverage-baseline or `dist/` change.
