# Proposal

## Why

`candidates` asked `gh pr list` for 50 open pull requests and reconcile asked for 100, with no label filter, then filtered by label in memory. Both specs already scope the query by label — landing candidate discovery lists open pull requests that carry `mergeable`, and owner-review reconciliation inspects open pull requests carrying the label — but the implementation read a recent window instead. Once more than that many pull requests were open, an older labeled target never appeared in `candidates` or in `refused`, and an orphaned `owner-review` label on an older pull request was never cleaned up.

## What Changes

- Pass the label to `gh pr list` (`--label mergeable` in `candidates`, `--label owner-review` in reconcile) so GitHub selects the entries. `--search` is not used: it takes a query string in search syntax, while `--label` is the documented label filter and keeps the default listing order.
- Replace the implicit `50` and `100` with one exported `PR_LIST_LIMIT` of 200 in each script, and report a `truncated` note carrying the entry count when a listing returns that many entries, so the cap is visible instead of a silent drop. Reconcile also prints the note in its text output.
- Keep the `candidates` and `refused` entry shape and ordering, and the reconcile `results` ordering, unchanged; the note is an extra top-level field reported only when the cap is reached.
- Guard the label-scoped request and the truncation note in `test/pr-review-land.test.mjs` and `test/pr-review-owner-review.test.mjs`, and name the behavior in `docs/pr-review.md`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

`pr-review-pipeline` gains one requirement for the bounded, label-scoped listing. The two existing requirements that this change repairs are left untouched: `Landing candidate discovery` already says `candidates` lists open pull requests that carry `mergeable`, and `Owner-review reconciliation` already says reconcile inspects open pull requests carrying the label, so only the implementation lagged. Their descriptions are also at the 493 and 287 character marks, and extending the 493 character one would breach the 500 character archive limit. The new requirement carries the part the specs do not state yet: the fixed entry cap and the visible truncation report.

## Impact

- `scripts/pr-review-land.mjs`: the `candidates` listing request and a `PR_LIST_LIMIT` export.
- `scripts/pr-review-owner-review.mjs`: the reconcile listing request, a `PR_LIST_LIMIT` export and the text-output warning line.
- `test/pr-review-land.test.mjs`, `test/pr-review-owner-review.test.mjs`: recorded request arguments and the truncation note.
- `docs/pr-review.md`: the landing authorization and reconcile paragraphs.
- No watch, landing-state, label-write, dependency, workflow, hook, coverage-baseline or `dist/` change.
