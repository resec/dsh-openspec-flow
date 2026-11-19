# Design: Refine review card visibility

## Context

See `proposal.md`. The review card is a JSON file under the change's review directory; `writeCard` stores the file and marks the record, and `reviewCards/get` reads files for the requesting session, binds unclaimed ones to a turn and returns the payloads. The review record already carries `independent`, `mode` and `changerSessionId`; the card payload already carries `change`. The collapsed summary is rendered by `cardSummary` in `client.js`.

Two facts shape the approach. The session that writes the card is the one that reports: `self-report` in a self review, reviewer `submit` in an independent review, while `wait` and `report` currently write a copy for the changer. And the Host delivery path is the only layer that knows the review record and can therefore distinguish a changer copy from a reviewer card; the client only sees payloads.

## Goals / Non-Goals

Goals:

- One review card per round, written by the session that submits the report.
- Existing changer review cards stop appearing without deleting card files or rewriting records.
- The collapsed summary identifies the change.
- Keep self-review cards, reviewer cards and resolution cards unchanged.

Non-Goals:

- No change to the card payload, record format, card file layout, tool results or review protocol.
- No deletion or migration of existing card files or `cards` markers.
- No translation of the change name; it is recorded data.
- No truncation or pagination of the summary; long names wrap as the existing header does.

## Decisions

### Stop writing the changer copy

`waitReview` and `readReport` lose their review-card write blocks; `report` becomes read-only for cards. A review card is written only by `self-report` (self review) and reviewer `submit` (independent review). This removes the duplicate at the source and keeps one rule in the write path.

Alternative considered: keep the writes and only filter at delivery. Rejected: it leaves files that can never be shown, keeps `wait`/`report` in the documented write points, and makes the `report` backfill test meaningless.

`report` also loses its self-review backfill. In the normal flow the self-review card is written by `self-report`; the backfill only fired when that write had failed, and a retry through `report` cannot succeed where the session write already failed. Accepted.

The `change-review` capability still requires a best-effort card-marker write after a successful `wait`. The scenario cannot be dropped from a MODIFIED block (validation preserves every existing scenario), so the delta removes "The changer checks the reviewer report without polling" and adds "The changer reads the reviewer report without polling" with the remaining scenarios. The wait contract itself (non-polling read, readiness result, deadline) is unchanged.

The shipped propose and apply skills describe the old behavior ("in the main session when the changer reads the report with `wait` or `report`"). Both skill files move to "reviewer session for an independent review, changer session for a self review"; `test/skills.test.mjs` pins the new wording. This is a skill-content update, not a change to the review protocol.

### Withhold legacy cards at delivery

`readCards` reads the review record per card directory and skips a `phase: "review"` card whose card session equals the record's `changerSessionId` when the record marks an independent review (`independent: true`, or `mode: "reviewer"` for an older record). The check runs before the already-bound branch and before any binding write, so a legacy bound card is hidden too and an unbound one stays unbound.

The record selector is the card's recorded review kind: `apply` reads `apply-review.json`, every other value reads `review.json`, and a missing kind falls back to `review.json`. One directory can hold both records, so the per-request cache is keyed by directory and kind, not by directory alone. This also keeps a draft self card visible while an apply changer card in the same directory is withheld.

Alternative considered: implement the rule in the client. Rejected: the client receives payloads without a session or role identity, so it cannot tell a changer card from a reviewer card. Alternative: delete legacy card files. Rejected: destructive, rewrites review history, and needs a migration for every review root.

A record that is missing, unreadable, has no `changerSessionId` or is a self review leaves delivery unchanged. An unreadable record is logged as a warning but does not abort other cards in the same directory; this keeps the card surface's existing degradation rule.

The two existing requirements the withholding narrows keep their behavior for every card the rule does not withhold: "The Host binds cards to the turn" gains the exception, and "Legacy cards remain readable after the shared-root upgrade" gains the same exception. Both are MODIFIED deltas; the untouched scenarios stay verbatim so archive preserves them.

### Use the recorded changer session id

In DSH the `Agent.id` is a `SessionId`; `record.changerSessionId` (written from `agent.id`) and the card file's `sessionId` (written from `agent.session.id`) are therefore the same value in production. The existing tests construct agents with distinct `id` and `session.id` values; the new endpoint tests must build the production shape so the filter is exercised, and the fixture documents the invariant.

Alternative considered: add a writer role to every card file. Rejected: it only covers cards written after the change, does not solve the existing cards the user sees, and grows the payload.

### Render the change name in the client

`cardSummary` inserts the trimmed `card.change` between the phase title and the review kind, and omits the segment when the value is absent, empty or not a string. The payload already carries `change`; old cards get the new summary on the next render without a Host or file change.

Alternative considered: add a preformatted label to the payload. Rejected: display policy belongs to the renderer and the payload already has the fact.

## Risks / Trade-offs

- [A corrupt record could block card delivery] → The record read is guarded, logged and treated as "no filter"; other cards keep being delivered. Covered by an endpoint test.
- [A directory with both records picks the wrong record] → The selector uses the card's review kind and the cache is keyed by directory and kind; an endpoint test covers a draft self card and an apply changer card in one directory.
- [Distinct `agent.id` and `agent.session.id` in fixtures hide a filter bug] → New filter tests use one value for both, matching `Agent.id: SessionId`.
- [The production `Agent.id` / `agent.session.id` equality is inferred from the DSH `Agent` interface] → The interface declares `readonly id: SessionId` and the live session; if a future Host separated them, legacy changer cards would stay visible. No file is lost and the filter can be revisited with a recorded card-session field.
- [Shipped skills keep the old "main session" claim] → Both skill files and `test/skills.test.mjs` are in the task list.
- [A hidden card was unbound and the watermark moved past it] → Reverting the filter may not bind it to the old turn. No file or record is lost; this is acceptable for a display change.
- [Independent review with no findings has no changer card] → Intended. The report remains available through `report` and the reviewer session card.
- [Summary becomes longer] → No truncation is added; the existing header wraps, matching the no-truncation rule.

## Migration Plan

No data migration. Existing card files and records stay as they are; the new Host filters the changer's review cards at delivery and the new client renders the change name for old cards. Rollback is a code revert: the removed write points return and the filter stops hiding legacy cards. Records and card files are never rewritten.

## Open Questions

None.
