# Proposal: fix-superseded-check-runs

## Why

GitHub keeps every check run attached to a head SHA, so `statusCheckRollup` can list a failed entry from an earlier workflow run next to a successful entry from a later run of the same check. The review watch requires every entry to be successful, so a pull request whose newest run is green is never polled, and the landing command shares the same helper. A re-run after a false failure therefore leaves the pull request permanently ineligible.

## What Changes

- Judge a rollup green by the newest entry of each check identity instead of by every entry.
- Ignore entries superseded by a newer run of the same check.
- Keep the watch, owner-review and landing on one shared judgment and define it in the pipeline spec.
- Keep the existing strictness: an empty rollup, a newest pending entry, a newest failure and an unknown conclusion are not green.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `pr-review-pipeline`: adds requirements that define when a rollup is green and how a superseded entry is identified, and restates the polling and owner-review requirements against that definition; the landing requirement already requires a green rollup and keeps its text.

## Impact

- `scripts/pr-review-watch.mjs`: `checksGreen` and its JSDoc.
- `scripts/pr-review-land.mjs`: same judgment through the shared helper; no new code path.
- `scripts/pr-review-owner-review.mjs`: same judgment through the shared helper; no new code path.
- `test/pr-review-watch.test.mjs`, `test/pr-review-land.test.mjs`.
- `docs/pr-review.md`: candidate, landing and requirement-length-section CI wording.
- No change to PR content, CI workflows, the state file format or the scheduled flow.
