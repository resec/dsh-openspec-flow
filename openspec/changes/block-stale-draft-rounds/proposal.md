# Proposal: Block stale draft rounds

## Why

A draft round reviews the change artifacts as they are on disk, and nothing stops the changer from editing them while the round is open; the plugin's own execution-preflight reason even tells the changer to "edit the artifacts and resume review=draft". `resume` then silently rewrites the round's object hash and deliberately does not wake the reviewer, because the contract assumes "no report means the reviewer is still working". Two failures follow. A reviewer whose submit was refused for the moved object ends its turn and is never woken again, so the review parks until a human notices. A reviewer that submits after the rebind has its report accepted against artifacts it never read. Both were observed on this repository: a draft review parked for six hours, and a report accepted after its `tasks.md` had been rewritten.

## What Changes

- `openspec_review` with `action: "resume"` no longer rebinds a stale round. When the latest round has no report and the current object hash differs from the round's hash, the plugin records a `blocked` report on that round with no findings and the two hashes, then opens the next round, which wakes the reviewer. **BREAKING**: a round whose artifacts changed can no longer be reused.
- `openspec_reviewer` with `action: "submit"` accepts a `blocked` report while the object is stale, records the stale hashes, and refuses any other verdict with a message that names `blocked`. The accepted report travels through the existing submit wakeup, so the changer is woken with a blocked verdict instead of silence.
- A file watch on the change directory during an open draft round with an independent reviewer sends one message to the reviewer when the artifact hash changes, so it stops and reports `blocked` instead of reviewing content the round will not credit. The watch starts when a round opens, sends at most one notice per round, and stops when the round has a report or the review is abandoned.
- The flow rule and the review document state that the change artifacts must not be edited while a draft round is open, that an edit closes the round as blocked, and that `resume` opens the next round and wakes the reviewer.
- The stale-object reason and the execution-preflight reason point at the same recovery, so no plugin response tells the changer to edit and then wait.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `change-review`: a stale round closes as blocked instead of being reused; the next round wakes the reviewer; the draft round watch exists and its notice is bounded.
- `tool-surface`: `openspec_reviewer submit` accepts a blocked report for a stale object and refuses other verdicts with a recovery message.
- `flow-policy`: the flow rule states the no-edit rule and the blocked-round recovery.
- `review-documentation`: the review document states the stale-round block, the no-edit rule and the watch.

## Impact

- `lib/tools/review.js`: the draft round advance, the watch arm and disarm, and the stale notice projection.
- `lib/review/submit.js`: the stale-round close and optional report metadata.
- `lib/review/reviewer-tool.js`: the stale blocked submit path.
- `lib/review/watch.js`: new file watch module.
- `lib/policy.js`: the flow rule text.
- `index.js`: watch disposal on plugin unload.
- Specs listed, `docs/review.md`, and regression tests for the round advance, the submit path, the watch lifecycle, the readiness next action and the rule text.
- No new dependency. The review record gains optional round fields (`blockedReason`, `staleFrom`, `staleTo`) and an optional `staleNotice`; older records stay readable.
