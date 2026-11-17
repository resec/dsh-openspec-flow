# Design: enforce-disposition-target

## Context

See proposal.md — Why. The relevant current state:

- `reviewKind(args)` defaults an absent `review` to `draft` for every action (`lib/tools/review.js`).
- The draft record is `review.json` and the apply record is `apply-review.json`; both name their first-round findings `R1-01`…`R1-<nn>`, so an ID matches across records.
- `applyStarted(directory, record)` already exists for the draft freeze on `start` and `resume` (`lib/tools/review.js`).
- `draftReadiness` returns the unqualified `openspec_review action=dispose` (`lib/review/readiness.js`), and the review tool and the reviewer tool rewrite it for apply only.
- The first apply records `applyBaseCommit` in `sealDraft` with a plain `saveReview`, outside the review lock, after an unlocked readiness read in `assertDraftReviewReady`.
- The next-action string is stored in review cards, so wherever it is produced, it reaches the agent unchanged.

## Goals / Non-Goals

**Goals**

- A disposition cannot reach a record the caller did not name.
- The tool's own next actions, refusals and shipped skills stay valid calls under the new rule.
- The draft freeze covers both mutating actions and cannot be erased by a concurrent seal write.

**Non-Goals**

- No freeze for `report`, `self-report`, `abandon` or `extend` on a frozen draft.
- No change to apply dispositions or to the plan-change waiver.
- No record format change, no migration of existing records.
- No change to the defaults of the read-side actions.

## Decisions

### The kind is required per disposition action, not globally

Add a check used by `dispose` and a finding `waive` only: an absent or invalid `review` fails before the change context is loaded. `reviewKind` keeps its draft default for `start`, `resume`, `status`, `wait`, `report`, `self-report`, `extend` and `abandon`.

Alternative rejected: make `review` required in the JSON Schema for every action. The schema has no per-action `oneOf`, so this would force the kind onto read calls and their many call sites without touching the mutation risk. A second alternative — keep the default but refuse only when both records exist — makes the outcome depend on unrelated state; a project with a single record would still accept a misfired call.

The error names the parameter and both values: `openspec_review action=dispose needs review: "draft" or review: "apply"`.

### The draft freeze runs inside the review lock

`disposeReviewFinding` already holds the review-directory lock for the read-modify-write. After `readReview`, a `draft` disposition checks `applyStarted(directory, record)` and throws. The message mirrors the existing `resume` refusal and points at the apply review: `the draft review is frozen once apply started; inspect it with openspec_review action=status review=apply`. The plan-change `waive` path is untouched: it already requires apply started.

### The seal write takes the review lock

The freeze only holds if the writer that sets `applyBaseCommit` participates in the same lock. Today it does not: a disposition can read before the seal writes and save after it, erasing `applyBaseCommit` and reopening the freeze; in the opposite order the seal save silently drops the disposition it read. The change wraps the seal's read-check-write in `withReviewLock`, re-reads the record, recomputes readiness from that read, and returns without writing when the record already carries a base. The lock order stays apply-lock → review-lock, the order the apply-review start already uses (`acquireApplyLocks` before `withReviewLockAsync`), so no inversion is introduced.

This is not a new rule: the existing requirement "Review state writes are serialized and atomic" already requires every review mutation to hold the review-directory lock. The seal write is a review mutation, so the change makes it conform.

The seal is private to `lib/tools/review.js`, and `assertDraftReviewReady` skips it once a base is recorded, so the re-read branch is unreachable through the tool. The change exports `sealDraft` for the test and covers both branches directly: a record file changed after the caller's read keeps its change and gains the base; a record whose readiness dropped refuses and leaves the file without a base.

### Readiness emits the kind-qualified dispose action

`draftReadiness` changes its not-ready dispose action to `openspec_review action=dispose review=<kind>`. Then:

- `nextActionFor` and its apply-only rewrite are removed; `gateAdvice` returns `readiness.nextAction` directly.
- `assertNoOpenFindings` builds the same qualified string for its refusal.
- The reviewer tool drops only the dispose rewrite and keeps its `readiness.ready ? 'openspec_archive' : readiness.nextAction` mapping, so a ready apply review still wakes the changer toward archive.
- Cards store `readiness.nextAction`, so status, wait, submit and card guidance become valid together.

Alternative rejected: keep the unqualified string and qualify at each projection. There are five readiness call sites plus the card writer; one source is fewer places to forget, which is the failure class this change removes.

### The verification refusal message carries the kind

`assertVerifications` builds the "dispose it with `openspec_review` … `status=fixed`" message (`lib/review/report.js`), reached through `assertReport`. `assertReport` gains the kind in its options and passes it to `assertVerifications`; `submitReport` passes `record.review`. `applyVerificationsTo` only rewrites statuses and stays unchanged. Leaving the message unqualified would tell the changer to run the exact call the new rule refuses.

### Both shipped skills name the kind, and the test enforces it

The apply skill places `review: "apply"` immediately after every action it names in `## Apply review` (`status`, `start`, `self-report`, `wait`, `resume`, `dispose` and a finding `waive`), including clauses that do not repeat the tool name. The propose skill does the same with `review: "draft"` in `## Draft review`. The packaged-skill test isolates both sections, scans every `action: "<action>"` occurrence, and requires the section's kind between that occurrence and the next `action:` occurrence or the section end.

A per-instruction rule was rejected: one numbered instruction can carry several calls, so removing the kind from one clause while another clause keeps it still passes. A raw `openspec_review` token scan was rejected for the same reason plus the clauses that name an action without the tool name. A fixed 120-character window was rejected too: two neighbouring clauses sit closer than that, so the first clause could borrow the second one's kind. Scanning to the next action bounds each clause exactly, and it covers `status` without enumerating the actions.

The plan-change waiver paragraph in the apply skill sits outside the apply review section and is not scanned.

### Docs and the README carry the rule

`docs/review.md` updates the batch-disposition paragraph, both dispose examples, the readiness next action and the failure table; the README updates its review paragraph. `test/review-doc.test.mjs` gains assertions that every dispose example names its kind and that the README carries both sentences.

## Risks / Trade-offs

- [A caller that relied on the draft default now fails] → The failure is loud, names the parameter and both values, and happens before any write; both shipped skills and every next action are updated in the same change.
- [Test churn across six review test files] → Mechanical: draft call sites add `review: "draft"`, apply call sites already pass `review: "apply"`. The suite fails on any miss.
- [Cards written before the upgrade keep an unqualified next action] → No migration. A stale card is guidance only; the next tool call requires the kind, and new cards carry it.
- [The seal now takes the review lock on the first apply] → Contention is brief and the order matches the existing apply-review start. A disposition that landed between the unlocked readiness read and the lock makes the re-read refuse; the caller retries, so the failure is closed rather than silent.
- [A future skill clause mentioning an action without the kind] → The action-occurrence rule requires the kind before the next action, which is the intent.

## Migration Plan

No record or policy migration: existing records keep their bytes and their states, and only new calls are validated. The behavior reaches a host when the plugin bundle is rebuilt and installed; until then the installed copy keeps the old default and the old skill text. A rollback is a code revert plus a bundle rebuild; no data is rewritten.

## Open Questions

None.
