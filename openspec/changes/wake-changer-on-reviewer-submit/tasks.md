# Tasks

## 1. Test baseline and the minimal regression

- [x] 1.1 Add `agents.get(id)` and agent `session.header` support to `test/fake-context.mjs`, let `test/review-fixtures.mjs` `externalSetup` seed live agents, and add a `subagents` stub that steers an idle target and records it; verify `node --test test/review-wait.test.mjs` keeps the existing cases green
- [x] 1.2 Add the minimal regression case in `test/review-wait.test.mjs`: a reviewer submit while the changer is idle delivers one steer message to the changer; verify the case fails on the current implementation because no wakeup is sent
- [x] 1.3 Rewrite the wait cases for the non-blocking contract: `wait` returns `ready`, `waiting` or `overdue` from the post-write read, `waiting` names the end-turn instruction, and no poll interval is consulted; retire `wait can time out and can return after a later submission` (split into a ready and an overdue case), retire `wait fails closed when the review record disappears` and `wait reports cancellation before any deadline` (the REMOVED migration states a non-polling wait no longer observes them); verify the rewritten cases fail on the current polling implementation
- [x] 1.4 Add the deadline cases: a short `waitMinutes`/`startedAt` fixture makes the deadline wake the changer, a submit before the deadline cancels it, and a repeated `wait` replaces the pending deadline; verify each case fails before the timer exists and `test.after` calls `clearReviewDeadlines()`

## 2. Wakeup and non-blocking wait

- [x] 2.1 Record `changerSessionId` on the draft and apply review records in `start`, `resume` and `wait` through a lock-scoped re-read-modify-write helper that never saves the pre-lock copy, compute the `wait` result from a fresh read after the write attempt, and register the waiting session in the deadline entry even when the write is skipped; verify a test starts, resumes and waits from different agents, a submit landing between the wait read and the wait write keeps its report, and a held lock leaves `wait` returning its state with a logged skipped write while the waiter is still woken on submit
- [x] 2.2 Add the wakeup helper used by `openspec_reviewer` submit: resolve the targets from the record and the pending deadline waiter (deduplicated), fall back to the reviewer `parentSession`, attempt each target independently so one failed send does not skip the rest, send one `subagents.sendMessage` steer message per target with the change, kind, round, verdict, readiness and the readiness `nextAction`, and log a failed delivery without rolling back the report; verify 1.2 turns green, a failing `sendMessage` keeps the report recorded, a stale record target does not skip a live waiter, a legacy record targets `parentSession`, a record without either identity logs and sends nothing, and a lock-skipped waiter is among the targets
- [x] 2.3 Make `waitReview` return from a post-write read without a poll loop, add `waitState` to `REVIEW_OUTPUT_SCHEMA` (string enum `waiting`, `ready`, `overdue`), return the state, set the end-turn reason and the end-turn `nextAction` on `waiting`; verify 1.3 turns green, the schema declares `waitState`, a `wait` value carries no top-level key that the schema does not declare, and the result read is the one after the best-effort write (not a stale guard copy)
- [x] 2.4 Register the deadline timer when `wait` returns `waiting`, store the waiting session as its target, `unref()` it, clear it on submit, `extend`, `abandon`, `waive-reviewer`, `retry`, `replace`, `resume` and a repeated `wait`, export `clearReviewDeadlines()` for `index.js` and `test.after`, and send the overdue steer on fire when the reviewer slot is still live; verify 1.4 turns green, an unreachable reviewer logs without throwing and sends nothing, and `node --test test/review-wait.test.mjs` exits promptly
- [x] 2.5 Remove `reviewPollMs`, `OPENSPEC_FLOW_REVIEW_POLL_MS` and the poll-interval unit test; verify `grep -rn "OPENSPEC_FLOW_REVIEW_POLL_MS\|reviewPollMs" lib test` reports no hit outside the archived change and `node --test test/review-unit.test.mjs` passes

## 3. Policy, skills and documentation

- [x] 3.1 Update `lib/policy.js` to tell the changer to call `wait`, end the turn on `waiting`, and continue on the wakeup; verify `node --test test/policy.test.mjs` passes with the updated text assertion
- [x] 3.2 Update the propose and apply skills to end the turn on `waiting`; verify `node --test test/skills.test.mjs` passes and every `metadata.generatedBy` still equals `dsh-openspec-flow@<package.json version>`
- [x] 3.3 Update `README.md` and `docs/review.md`: remove the poll interval, describe the submit and deadline wakeups, the live-session limit and the unchanged `waitMinutes` bounds, rewrite the `等待超时` bullet (`docs/review.md:117`) and the closing reviewer example (`docs/review.md:196`) so they no longer say to wait again, and add a phrase assertion for the waiting/end-turn wording to `test/review-doc.test.mjs`; verify the grep for `OPENSPEC_FLOW_REVIEW_POLL_MS` reports no hit and `node --test test/review-doc.test.mjs` passes with the new assertion

## 4. Integration checks

- [x] 4.1 Verify `npm test` passes on Node 24 with the rewritten wait cases and the new wakeup cases
- [x] 4.2 Verify `npm run coverage:check` passes for the changed lines and the new helpers
- [x] 4.3 Verify `openspec_inspect` with `action: "validate"` and `strict: true` passes for this change

## Workflow follow-up

- Commit the implementation before apply review.
- Run apply review and fix every blocker.
- Archive the change only when the user asks, after the apply review is ready.
