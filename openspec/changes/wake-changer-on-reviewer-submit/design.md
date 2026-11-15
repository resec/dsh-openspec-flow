# Design: wake-changer-on-reviewer-submit

## Context

See `proposal.md` — Why. Current facts that shape the design, read from this tree and the pinned DSH 0.2.2-rc.2 runtime:

- `waitReview` loads the change context once, then polls `readReview` in a loop: a 90-second segment, `reviewPollMs()` from `OPENSPEC_FLOW_REVIEW_POLL_MS` (default 250 ms), and a `waitMinutes` deadline.
- A `waiting` result carries `reasons` and `nextAction: "openspec_review action=wait"`, so the model calls `wait` again. There is no explicit wait-state field in `REVIEW_OUTPUT_SCHEMA`.
- The reviewer is a continuable subagent started with `delivery: "caller"`. Its submit is handled by `openspec_reviewer` in `lib/review/reviewer-tool.js`; the report is written before the tool returns.
- DSH wakes an idle agent when `subagents.sendMessage` delivers to it: the target root branch calls `sendWaking`, and the agent loop's `wakeDriver` starts a turn for an idle agent. `sendMessage` always uses `steer` delivery.
- A reviewer settlement notice cannot replace this wakeup: `delivery: "caller"` suppresses settlement delivery, and the reviewer is reused across rounds, so it does not settle when it submits.
- The review record already stores each reviewer slot's child id; it does not store the changer session. The reviewer session header carries `parentSession` when the slot was created by that changer.

## Goals / Non-Goals

Goals:

- No polling: `wait` returns from a read after the best-effort session write; the lock-scoped write re-reads the record once more.
- A submit-triggered steer wakeup that reaches the changer and any pending waiter, whether it is idle or still ending its turn.
- A deadline wakeup that replaces the removed polling loop.
- Compatibility with records written before this change.

Non-Goals:

- Forcing the model to end its turn. DSH exposes no tool-result signal that ends a normal turn; the result text and policy only guide it.
- A next-turn (`followup`) delivery. The plugin cannot construct `UserMessage` values without importing `@deepseek-ai/*`, and `sendMessage` fixes `steer`.
- Restoring a disposed changer agent. A wakeup targets a live session only.
- A durable deadline across a plugin or Host restart.

## Decisions

### `wait` reads without polling and reports a wait state

`waitReview` keeps the existing guards (record present, reviewer mode) and computes the result from a read after the best-effort session write:

- `ready` when the latest round has a report, the reviewer is waived, or the state is `passed`.
- `overdue` when the current time is at or past `startedAt + waitMinutes * 60_000`.
- `waiting` otherwise.

The attempt is at most three reads (the guard read, the lock-scoped write re-read, and the result read) and never a poll loop. This supersedes the intent's shorthand "read the review record once"; the extra read is the price of not overwriting a concurrent submission.

The result gains `waitState: "waiting" | "ready" | "overdue"`, declared explicitly in `REVIEW_OUTPUT_SCHEMA`. The Host validates every tool result against that closed schema, so the field must be part of it; the fake Host used by the suite does not validate outputs, so a test must assert the declaration and that a `wait` value carries no undeclared top-level key. A `waiting` result sets `reasons` to a line that says the reviewer has not submitted and the turn should end, and sets `nextAction` to an end-turn instruction (`end-turn; await the reviewer wakeup`) rather than a tool call. It no longer returns `nextAction: wait`, and it does not point at `report`, which fails while the round has no report.

Alternatives:

- **Keep the 90-second segment and poll**: leaves the token cost and the busy session the proposal removes.
- **Sleep inside one tool call until the deadline**: risks the host tool-call budget and hides the wait from the model.

### The submit path sends one steer wakeup

`submitReport` stays synchronous and unchanged. After it returns, the reviewer tool resolves the changer session, then calls:

```text
subagents.sendMessage(reviewerAgent, changerSessionId, [text], { signal })
```

The text names the change, review kind, round, verdict, readiness and the next action, which is the readiness `nextAction` and may be `openspec_apply_next`, `openspec_archive` or an `openspec_review` call. It does not include the report body; the changer reads it through `action: "report"`.

The targets are the review record's `changerSessionId` and the pending deadline entry's waiter, deduplicated; the entry is read before it is cleared. When neither exists, the target falls back to `exec.agent.session.header.parentSession`. The sender is the reviewer agent in the current tool execution. Each target is attempted independently: a failed send to one target is logged and the remaining targets are still attempted, so a stale recorded session cannot skip the live waiter. A missing service or missing target is logged; the report remains recorded.

Alternatives:

- **Settlement notice (`delivery: "parent"`)**: not emitted on submit because the reviewer is continuable and reused.
- **Direct `agent.followup`**: needs a `UserMessage`, which a plain-ESM plugin cannot construct against the package contract.

### The review records the changer session

`start`, `resume` and `wait` write `changerSessionId` on the review record from the calling agent's session id. The latest caller wins, so a session that parks on an existing review through `wait` is the session the submit and deadline wakeups address. Old records keep working through the parent-session fallback.

The write is a lock-scoped re-read-modify-write, never a save of the pre-lock copy. `rememberChangerSession(directory, kind, sessionId)` re-reads the record inside `withReviewLock`, sets only `changerSessionId`, and saves; `wait` computes its result from a fresh read after the write attempt, so a reviewer submit that lands between the wait read and the wait write keeps its report pointer.

The `wait` write is best-effort: `withReviewLock` refuses rather than queues, and the submit holds the same lock, so a lock-contention error is caught, logged and ignored; `wait` still returns its result and the next `wait` retries the write. A skipped write registers the waiter in the deadline entry anyway (when the result is `waiting`), and the submit and deadline wakeups address that entry waiter as well, so a lock-contended write never turns a wait into a tool error and never leaves the latest waiter parked.

The field is additive; `readReview` does not validate a closed shape, so older records and older plugin versions ignore it.

### The deadline is a process-local timer per review

When `wait` returns `waiting`, the plugin registers a deadline entry keyed by the review directory and kind. The entry stores the round, the deadline, the changer session and the reviewer slot id. The timer is `unref()`'d so a test file that ends with a pending `waiting` does not keep the process alive, and the deadline delay is clamped to a non-negative value.

A later submission, `extend`, `abandon`, `waive-reviewer`, `retry`, `replace`, `resume` or another `wait` replaces or clears the entry. The `resume` arm matters when it reuses an unreported round and resets `startedAt`, which moves the deadline basis. When the timer fires, the plugin re-reads the record; if the round now has a report, the reviewer is waived or the record is abandoned, it does nothing. Otherwise it sends the same kind of steer message with `overdue` and the next actions (`extend` or `abandon`) to the recorded changer.

The timer uses the reviewer slot's live agent as the sender: `ctx.agents.get(reviewerId)`. It wakes the entry's waiter, falling back to the record's changer when the entry carries none. When the reviewer is no longer live, the wakeup is skipped with a warning; the review itself is then in the same state as a vanished reviewer and needs `retry`/`replace`/`waive-reviewer`.

Alternatives:

- **No timer, only a `status` check**: the changer would wait indefinitely after it ended its turn, contradicting the `waitMinutes` contract.
- **Direct `changer.steer` with a hand-built message**: bypasses the subagent delivery contract and would depend on an internal message shape.

### The wakeup registry is shared between both plugin entries

The timer registry and the wakeup helper live in one review module imported by both plugin entries: `index.js` (the changer tools) and `lib/review/reviewer-tool.js` (the reviewer submit). Node ESM caches the module by file path, so the changer's `wait` and the reviewer's `submit` see one registry in the same process.

Ownership is explicit: the changer entry (`index.js`) registers the registry cleanup through `ctx.effect`, and the module exports `clearReviewDeadlines()` for that effect and for `test.after`. The reviewer entry never clears the registry, because a reviewer disposal must not cancel a changer's pending deadline. The reviewer entry does not need a new injection: the wakeup helper reads `ctx.get('subagents')` and is a no-op when the service is absent.

### The policy and skills state the wakeup

`lib/policy.js` and the propose/apply skills tell the changer to call `wait`, end the turn on `waiting`, and continue on the wakeup. They no longer describe polling. The `OPENSPEC_FLOW_REVIEW_POLL_MS` documentation and its unit test are removed.

## Risks / Trade-offs

- [A `waiting` test leaves a live timer] → The timer is `unref()`'d and `test.after` calls `clearReviewDeadlines()`, so `node --test test/review-wait.test.mjs` exits promptly and no timer fires against a deleted fixture root.
- [The shared registry assumes one module instance in one process] → Documented as a limit: both entries load the same file in the same Host; a second process would not share deadlines.
- [A submit lands between the `wait` read and the `wait` write] → The write is a lock-scoped re-read-modify-write and `wait` recomputes from a fresh read, so the submit's report pointer survives; a test exercises the interleaving.
- [A lock-contended `wait` write fails the call or loses the waiter] → The write is best-effort: catch, log and return the read result; the waiter is still registered in the deadline entry, so the submit and deadline wakeups address it, and the next `wait` retries the write.
- [The result read count is not literally one] → At most three reads (guard, lock-scoped write re-read, result read), no poll loop; design and spec state the extra read so no implementer drops the fresh read.
- [A `wait` issued from a different session targets the recorded session] → `wait` writes the caller to `changerSessionId` under the review lock, so the latest parking session is the target; records from older versions still fall back to `parentSession`.
- [A non-polling `wait` no longer observes mid-call deletion or cancellation] → Stated in the REMOVED migration; the suite retires those two cases instead of silently dropping them.
- [The model calls `wait` again despite the result] → `waitState`, the reason text, the end-turn `nextAction` and the policy line all say to end the turn; a repeat call simply re-reads the record and replaces the deadline, so the cost is one extra turn rather than a loop.
- [The submit arrives while the changer is still ending its turn] → `steer` injects at the next step, so the message is handled in the same turn or the next; if it arrives after idle, it starts a new turn.
- [The deadline timer fires after the Host restarted] → Timers are process-local and lost on restart. The record retains the deadline; the next `status` or `wait` in a live session reports the same outcome. Documented as a limit.
- [The reviewer is not live when the deadline fires] → Skip the wakeup and log; the review is already stuck and the changer/user can `retry`, `replace` or `waive-reviewer`.
- [A user steer competes with the wakeup] → Both are steer messages; the model sees both in order and the review record remains the source of truth. No dedupe is needed because a round accepts one report.
- [Coverage of timer paths] → The deadline test writes a short `waitMinutes`/`startedAt` into a fixture record and waits for the overdue steer; the test suite gains a bounded delay rather than a real 1-minute wait.

## Migration Plan

1. Ship the non-blocking `wait` and the submit/deadline wakeups together; a release with only one half would leave the changer waiting without a waker.
2. Remove `OPENSPEC_FLOW_REVIEW_POLL_MS` from the README and `docs/review.md`. Existing environments may still set it; the plugin ignores it.
3. Old review records without `changerSessionId` fall back to the reviewer's `parentSession`; no record rewrite is needed.
4. Rollback: revert the plugin version. Records written by this version carry an extra field that older versions ignore.

## Open Questions

None.
