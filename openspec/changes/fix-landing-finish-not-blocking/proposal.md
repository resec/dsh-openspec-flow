# Proposal

## Why

`finishLanding` writes the manifest, removes the checkout and the landing branch, and then calls `forgetPullRequest`. When that call fails, the landing entry keeps the phase it had before the call, `pushed`. `OPEN_PHASES` lists `pushed`, so `assertSingleLanding` treats the entry as an unfinished landing and refuses every later `candidates` listing and `prepare` with `PR #<n> is already landing in phase pushed`. Main is already pushed at that point: the only work left is local cleanup, so one failed cleanup stops all landing until the operator notices.

## What Changes

- Drop `pushed` from `OPEN_PHASES`: a landing that already pushed main is not unfinished, so it no longer refuses another landing.
- Keep `finish` retryable for `pushed` and keep `prepare` for the same pull request refusing a phase past the merge, so a retry cleans up rather than prepares again.
- Name the retry phase in the scheduled run of `docs/pr-review.md`, so a later run finishes the cleanup.
- Cover the failure with a test: the first `finish` fails, the entry stays `pushed`, another pull request is still listed and prepared, and a second `finish` succeeds without a second push.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `pr-review-pipeline`: "Landing state and recovery" now counts only a landing that has not pushed main as unfinished, and a new "Pushed landing cleanup" requirement states that the cleanup of a pushed landing is retryable and does not block another landing.

## Impact

- `scripts/pr-review-land.mjs`: the `OPEN_PHASES` set and its comment.
- `test/pr-review-land.test.mjs`: one new failure-path test and two documentation assertions.
- `docs/pr-review.md`: the resume phase list, the `finish` step and the landing phase paragraph.
- No change to the manifest, the push path, the phase names or the landing sequence; no dependency, workflow, hook, coverage-baseline or `dist/` change.
