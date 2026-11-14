# Design: remove review limits

## Context

See `proposal.md` for the motivation. The validator lives in `lib/review/report.js`; `text()` is the single place that applies a character cap, and `assertFinding`/`assertReport` call it for every field. `outOfScope`/`residualRisks` additionally carry a 3-entry cap. The reviewer `retry` and `replace` actions guard their counts in `lib/tools/review.js`, while the slot already records `retries` and `replacements`.

The draft and apply reviews share both code paths: `openspec_review` and `openspec_reviewer` submit through the same `assertReport`, so one edit covers both.

## Goals

- Remove the three classes of caps without changing any other rejection rule.
- Record the resulting contract in the spec and in `docs/review.md` so a future cap cannot return silently.
- Keep the audit trail that the caps are removed from: `retries` count and `replacements` history.

## Non-Goals

- Adding new validation (for example a maximum report size measured in bytes).
- Changing the tool schema, the brief wording, the storage format or the readiness rules.
- Reworking the report shape or the finding lifecycle.

## Decisions

### Delete the character cap instead of publishing it

Alternatives: publish 120/500/1000 in the brief and tool schema; truncate over-long fields and flag them; keep the caps and document them.

Publishing keeps the whole-report rejection: the validator runs before the record is written, so one over-long field still discards a complete report. Truncation silently rewrites the finding, and cutting "must" or "must not" can invert its meaning. Deletion is the only option that removes the trial-and-error loop, and the repository already records the new contract in the spec so the behavior is not hidden.

### Keep the non-empty check

`text()` still rejects an empty or whitespace-only value. An empty finding field cannot be disposed or verified meaningfully, and the brief already treats every field as required. Only the length branch is removed.

### Keep `retries` and `replacements` as records, remove only the guards

The slot fields feed `status` and later audits. Removing the guard lines leaves the counters intact, so repeated calls remain observable even though they are no longer refused.

### Keep the array type checks

`outOfScope` and `residualRisks` must still be arrays with non-empty string entries; only the entry-count cap and the per-entry length cap go away.

### Tests assert acceptance, not error text

The existing unit test asserts `/at most 120/` for `summary` and `/at most 60/` for an `outOfScope` entry; both become acceptance assertions. Finding-field caps had no test, so the new case covers a 5 000-character `problem` and `evidence`, plus four `outOfScope` entries. For `retry`/`replace`, an integration test using the fake subagent service calls each action twice and asserts both succeed and the slot records both.

## Risks / Trade-offs

- **A report can now be arbitrarily large** → The record grows and a later `action: "report"` read-back costs more context. Mitigation: the brief keeps its semantic guidance, and the record is only read on request.
- **A caller relied on the old rejection** → Marked **BREAKING** in the proposal. No caller in this repository does; the only assertions were the tests updated here.
- **Unbounded retry could loop** → The round and wait limits (`maxRounds`, `waitMinutes`) still bound the review, and every retry is counted; the user remains the one who triggers it.
- **A future cap could be re-added silently** → The modified requirements state that length and count are not validity conditions, so a later cap needs a visible spec change.

## Migration Plan

1. Delete the constants, the `limit` parameter, the call-site arguments and the entry-count branch.
2. Delete the two guard lines in `retryReview` and `replaceReview`.
3. Update the unit and integration tests, then `docs/review.md`.
4. Rollback: restore the deleted lines; no record or data migration is involved, and existing records are untouched either way.

## Open Questions

None.
