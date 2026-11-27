# Pull-request review report format

## Why

Pull-request comments expose the internal review vocabulary: finding ids carry the round (`R2-01`, `E1-02`), the findings table prints `severity`, and the only pass signal is a free-text `**Verdict:**` line. The watch also publishes one round's report instead of the finding set, so a reader cannot see which findings remain unresolved across rounds. The plugin now provides entry-driven reviews and configurable pass criteria; the contributor PR loop must use the `pr` entry and publish the plugin's readiness result rather than a locally derived verdict.

## What Changes

- Hand off the complete `openspec_review action=report review=pr` result, including `ready` and `reasons`, instead of only the report object.
- Render `**Review result:** passed` or `**Review result:** not passed` from the plugin's `ready`; remove `**Verdict:**` and never recompute the result from findings.
- Hide severity and internal finding ids. Assign stable PR-level numbers `F1`, `F2`, `F3` in watch state and reuse them across rounds and heads; an internal id seen only in a readiness reason also receives a number.
- Show every recorded finding's current state by reading the `pr` review record, with a report-only fallback and an explicit unavailable marker when the record cannot be read.
- Move the contributor PR flow from the `apply` entry to the `pr` entry: it relies on the archived baseline's `reviews.pr -> pr-tree` declaration, the prepared configuration sets `pipeline.beforeArchive` to `pr`, the session calls `review=pr`, landing reads `pr-review.json`, and archive checks the `pr` entry.
- Trust a result only from `**Review result:** passed`; old comments carrying only `**Verdict:** pass` stop counting, and the affected pull requests need a new comment.
- Make the comment marker format-aware: only a comment carrying the current `format=2` marker suppresses a same-head publish, and a watch entry commented in an older format is re-emitted for publication without opening a new review round.
- **BREAKING**: existing published comments are not trusted after this change; a new comment under the new format is required before owner-review or landing.
- Update `docs/pr-review.md`, `README.md`, `CONTRIBUTING.md`, `AGENTS.md` and the PR pipeline specification. No plugin `lib/**` code changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `pr-review-pipeline`: comment rendering, handoff shape, stable finding numbers, trusted result, and the contributor PR flow's `pr` entry.

## Impact

- `scripts/pr-review-watch.mjs`: handoff reader, comment renderer, state numbering, marker format, trusted result, prepared configuration copy.
- `scripts/pr-review-owner-review.mjs` and `scripts/pr-review-land.mjs`: trusted result and the `pr-review.json` record.
- `scripts/pr-local-shared.mjs`, `scripts/pr-publish.mjs` and `scripts/pr-local-land.mjs`: audit only; the local owner flow keeps the `apply` review record unless the entry model changes how that record is resolved.
- `docs/pr-review.md`, `README.md`, `CONTRIBUTING.md`, `AGENTS.md`, `test/pr-review-watch.test.mjs`, `test/pr-review-land.test.mjs`, `test/pr-review-owner-review.test.mjs` and `test/pr-review-doc.test.mjs`.
- Depends on `review-entry-model` and `review-pass-criteria` being archived first; the baseline `reviews.pr -> pr-tree` declaration and its candidate fields come from those changes.
