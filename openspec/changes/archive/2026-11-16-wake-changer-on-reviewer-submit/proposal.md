# Proposal: wake-changer-on-reviewer-submit

## Why

`openspec_review` with `action: "wait"` blocks for up to 90 seconds and polls the review record every 250 ms. When the segment returns `waiting`, the changer's model calls `wait` again, so one reviewer submission costs several extra model turns and keeps the changer session busy instead of idle. DSH already wakes an idle agent when another member of its subagent tree sends it a message, so the changer can end its turn and be woken by the reviewer instead of polling for it.

## What Changes

- `openspec_review` with `action: "wait"` returns immediately. It reports `ready` when the latest round has a report or the reviewer is waived, `overdue` after the deadline, and `waiting` otherwise. A `waiting` result tells the model to end the turn and wait for a wakeup.
- A successful `openspec_reviewer` `submit` wakes the recorded changer session and the pending-deadline waiter (deduplicated) through `subagents.sendMessage` with `steer` delivery. The message carries the change, review kind, round, verdict, readiness and the readiness next action, which may be `openspec_apply_next`, `openspec_archive` or an `openspec_review` action.
- **BREAKING** The `wait` deadline is enforced by a plugin timer instead of the polling loop. When `waitMinutes` expires without a submission, the plugin wakes the same changer with an `overdue` message. A submission cancels the timer.
- The review record stores the changer session id so the submit and deadline paths can address the right session; the submit also targets the pending-deadline waiter. When neither the record nor that entry names a session, the wakeup falls back to the reviewer session's `parentSession`; without either it skips the wakeup with a logged warning.
- **BREAKING** `OPENSPEC_FLOW_REVIEW_POLL_MS` and the polling requirement are removed. A non-polling `wait` also no longer observes a record deleted during the call or a call cancelled mid-wait. `waitMinutes` keeps its meaning as the timeout.
- The plugin updates its policy, shipped skills, README and `docs/review.md` to describe the non-blocking wait and the wakeup.
- The test suite gains a minimal regression first: an idle root agent is woken by the reviewer submit through `sendMessage`, then covers wait outcomes, the deadline wakeup, submit/timeout races and the missing-changer fallback.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `change-review`: replaces the polling wait with a non-blocking wait, adds the submit wakeup, the deadline wakeup, and the changer session recorded on the review.
- `skill-adaptation`: the propose and apply skills call `wait`, end the turn on `waiting`, and continue only after the reviewer submit, the deadline wakeup, or the user waives the reviewer; the self-report path is unchanged.

## Impact

- Code: new `lib/review/wakeup.js` (shared wakeup helper, deadline registry and clear hook), `lib/tools/review.js` (`wait`, changer-session field, timer registration), `lib/review/reviewer-tool.js` (submit wakeup), `index.js` (owner of the registry cleanup effect), `lib/policy.js` (workflow text).
- Tests: `test/review-wait.test.mjs`, `test/review-unit.test.mjs`, `test/review-doc.test.mjs`, `test/fake-context.mjs` (agent session headers and `agents.get`) and `test/review-fixtures.mjs` (a `subagents` stub that steers an idle agent).
- Documentation: `README.md`, `docs/review.md`, `skills/openspec-propose/SKILL.md`, `skills/openspec-apply-change/SKILL.md`.
- Configuration and the review record layout stay compatible: `waitMinutes` bounds are unchanged, and an older record without the changer session still reads.
- No CLI, schema, config-schema or tool-surface removal.
