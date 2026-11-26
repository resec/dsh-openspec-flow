# Proposal

## Why

A draft round that produced no review content still consumes a round number. When the artifacts change before the reviewer submits, `resume` closes that round as `blocked` and opens the next one; when the reviewer submits `blocked`, the report is treated as the round's conclusion. An author who edits the plan while the round is open, for example to fix a validation error, therefore starts the next real review at round 2 or later even though round 1 reviewed nothing.

The review record must keep the audit trail of every artifact version that was reviewed or abandoned: the brief, hashes, blocked report, cause and time.

## What Changes

- A draft round whose latest attempt has no report or a `blocked` report SHALL NOT consume a round number. `resume` archives that attempt as a round revision and refreshes the same round for the current artifacts.
- A round revision records the artifact hashes, the previous brief, an optional blocked report, the cause, the notice and the archive time under `round-N/revisions/MM/`.
- A `blocked` draft report is not the round's review conclusion: it does not enter the finding lifecycle, and readiness treats it as an unreported attempt.
- The same round is refreshed without adding a `rounds` entry, so the next normal round number does not advance.
- The round watch keeps notifying the reviewer for each changed object version, and every notice is retained with its revision.
- `openspec_review` status reports the recorded revisions of each draft round.
- The draft documentation describes the blocked-round reuse, the revision layout and the preserved audit trail.
- The registered flow rule and the shipped policy text state the archived attempt and the same-round refresh.
- A refreshed draft attempt writes its own review card file (`-a<n>`) while the replaced attempt keeps its card and turn binding.
- A substantive report (`pass` or `changes-requested`) keeps the existing behavior: the next round opens and consumes the next number.
- The apply review is not changed.

## Capabilities

- **New Capabilities**: None.
- **Modified Capabilities**:
  - `change-review`: round reuse, revision archive, readiness, reviewer wakeup, watch notice and stale submit behavior.
  - `tool-surface`: status output carries round revisions and blocked rounds name the same round entry.
  - `review-documentation`: the review document and README describe the blocked-round reuse and the revision layout.
  - `flow-policy`: the registered flow rule states the revision archive and the same-round refresh instead of the removed close-as-blocked recovery.
  - `review-cards`: a refreshed attempt keeps the earlier card and its turn binding, and writes its own attempt-suffixed card file.

## Impact

- `lib/tools/review.js`: draft resume refresh path, wakeup, status projection.
- `lib/review/submit.js`: archive a round revision instead of closing a stale round; keep a blocked draft report out of the finding lifecycle.
- `lib/review/readiness.js`: treat a blocked draft report as an unreported attempt.
- `lib/review/record.js`: revision accessors and backward-compatible defaults.
- `lib/review/reviewer-tool.js`: a blocked submit remains stored for the current round and is archived on resume.
- `lib/review/watch.js`: per-object-version notice after a refresh.
- `lib/review/revision.js`: new archive module for the previous brief, report and metadata.
- `lib/policy.js`: the flow rule text names the archived attempt and the same-round refresh.
- `lib/review/cards.js`: attempt-aware review card names and markers.
- `openspec/specs/flow-policy`: the main rule text changes with the policy.
- `lib/tools/review.js` output schema and `docs/review.md`, `README.md`.
- Tests for draft resume, blocked submits, watch notices, readiness, status output and documentation.
