# Design: pull-request review report format

## Context

The contributor PR watch renders the stored report with `renderReport`, which prints `**Verdict:**`, a severity column and round-scoped finding ids (`R<round>-NN`, `E<n>-NN`) (`scripts/pr-review-watch.mjs`). The session writes only the report object returned by `openspec_review action=report`, and `trustedPass` reads `**Verdict:** pass` from the latest trusted comment. The contributor flow currently uses the `apply` entry and `apply-review.json`.

Two dependency changes land first: `review-entry-model` makes review entries explicit and adds the `pr` entry with `pipeline.beforeApply`/`pipeline.beforeArchive`, and `review-pass-criteria` adds `passCriteria`, `allowDeferred`, `allowRejected` and the `verified-deferred`/`verified-rejected` finding states. This change changes only the repository-side PR scripts, their documentation and the `pr-review-pipeline` specification; it does not change plugin `lib/**` code, the review record schema, review cards or the tool surface. See [proposal.md](proposal.md) for motivation and [specs/pr-review-pipeline/spec.md](specs/pr-review-pipeline/spec.md) for the contract.

## Goals / Non-Goals

**Goals**

- Publish a comment that shows the plugin's readiness result, a stable PR-level finding number, and every recorded finding's current state without severity or internal ids.
- Keep the comment and the plugin conclusion consistent: the watch consumes `ready`, it never re-derives pass from findings or from `verdict`.
- Move the contributor PR flow to the `pr` entry end to end: prepared configuration, session commands, record reads, landing gate and archive gate.
- Make the handoff and comment behavior testable without a live GitHub or a live plugin.

**Non-Goals**

- Changing the internal report, finding lifecycle, review cards or `openspec_review` output shape.
- Reimplementing the pass threshold in the PR script.
- Rewriting or deleting comments published under the old format.
- Changing the local owner-managed PR flow, which keeps its `apply` review record.
- Adding a store selector to the PR flow. The current flow selects no store, so its record key is `local#<change>`.

## Decisions

### D1. Stable finding numbers live in watch state

`state.prs[<n>]` gains two optional fields: `findingNumbers` (an object mapping the internal id to an `F` number) and `nextFindingNumber` (the next unused integer). The state keeps `schemaVersion: 1`; an existing state without the fields reads as an empty map, because both fields are additive and the state is a local cache. Alternative: a separate numbering file. Rejected because cleanup, atomic writes and PR-forget already operate on `state.json`.

Assignment order is deterministic: the recorded findings in `pr-review.json` order, then the handoff report's findings in report order, then verification ids, then internal ids that appear only in readiness reasons. Each unseen internal id receives `nextFindingNumber`, which then increments. Existing numbers are never changed, reused or recomputed. A finding first seen in a later round receives the next number; a record that predates the map is numbered in record order. If the state is deleted, numbering restarts; comments already published are not rewritten, so the map is the only source for reuse.

Mapping is persisted only on `--apply`. The publish path writes the mapping before the GitHub comment write and updates `status`/`round` after a successful write, so a failed publish does not lose the numbers. A dry run assigns in memory and writes nothing. If a trusted marker in the current format already makes the head commented, no new comment is written and the existing mapping is left alone.

The same state entry records `commentFormat` (currently `2`) when a comment is published. `filterCandidates` skips a commented head only when its recorded format is current; a commented head with no format or an older format is re-emitted with `resume: true` so the session can re-read the existing report and publish a new-format comment without opening a review round. Every path that marks an entry `commented` writes `commentFormat: 2`, including the already-current branch of `publishComment` that skips the duplicate write; without that write, an entry recreated by `state --forget` would be re-emitted forever instead of settling.

### D2. Full finding state comes from the `pr` record

The watch resolves the shared review root from the main worktree's git common directory: `<git common dir>/openspec-flow/review`. It looks for `local#<change>/pr-review.json`; if that directory is absent it accepts one directory ending in `#<change>`, mirroring the existing landing record lookup. It reads only the `findings` array and never writes the record.

The record is authoritative for a finding's current state. The handoff report supplies this round's summary, verifications and reasons. The comment renders every recorded finding, including findings closed in earlier rounds. When the record file is missing, unreadable or malformed, the watch falls back to the handoff report's findings and verifications, adds a short "full finding state unavailable" note, and still publishes. When the record exists but a finding is known only from the report or a verification, that finding is rendered from the report and marked state-unavailable individually.

This is a same-repository convention between the PR flow and the plugin's record layout, not a public tool contract. The specification makes that boundary explicit. Alternative: extend `openspec_review action=report` with a full finding list. Rejected because the PR format does not need a tool-surface change, and the existing record already holds the data.

### D3. The review result is the plugin readiness result

The session writes the complete result of `openspec_review action=report review=pr` to the handoff file: `report`, `ready`, `reasons`, and optional `head`/`round`. The comment prints `**Review result:** passed` only when `ready === true`; otherwise it prints `**Review result:** not passed` and renders the reasons. `report.verdict` is never printed or consulted for the result. This avoids duplicating the pass threshold, which is locked in the `pr` entry's policy, and keeps the comment consistent with `openspec_archive`.

Reasons can name internal finding ids (for example, an unresolved finding). The renderer maps those ids through the same `F` map before printing; reasons without a finding id pass through. An internal id seen for the first time in a reason also receives a number, including when the record and report do not carry it, so no internal id leaks and no substitute label is invented. Alternative: recompute the result from the `F` states in the watch. Rejected because the plugin owns `passCriteria`, `allowDeferred`, `allowRejected` and the non-finding readiness reasons.

### D4. Handoff compatibility is conservative

The report reader accepts two shapes:

- The full result: an object with a `report` object, an optional boolean `ready`, and an optional array of non-empty `reasons` strings.
- The legacy report object: the previous handoff, which has `verdict`, `findings` and the other report fields but no `report` wrapper.

Both shapes keep the existing file name `pr-<n>-<head>.json`; a `head` field, when present, must equal the prepared head. The full shape validates `ready` as a boolean and `reasons` as strings. A legacy handoff is accepted, renders `not passed`, and names the missing readiness result. A missing or stale file, a malformed `report`, or a head mismatch refuses publication. Alternative: refuse legacy handoffs. Rejected because it would make old reports unpublishable during retries and would hide the reason; the conservative result is safer than inferring a pass from a verdict.

### D5. Trusted result replaces the verdict marker

Trusted markers carry `format=2`; the marker check accepts only that format, so an old marker does not count as a trusted marker and does not suppress a new publish. `trustedPass` filters the authenticated author's current-format comments for the current head, takes the latest, and returns true only when that body contains `**Review result:** passed`. A body carrying only `**Verdict:** pass` is not trusted. Owner-review eligibility and invalidation, landing candidate listing and landing authorization all call that check. The local owner-managed flow does not use comments and is unchanged.

The watch state records `commentFormat: 2` after a successful publish. The poll skips a commented head only when the recorded format is current; an old-format head is re-emitted for publication with `resume: true`, so the session re-reads the existing report and publishes the new comment without opening a round. `publishComment` also checks only current-format markers, so a direct publish over an old comment is allowed. Old comments are not edited, because they are the audit record of the previous format.

Migration is intentional: after deployment, an open PR with only an old comment loses `owner-review` and is not a landing candidate until a new comment is published for the current head. A rollback to the old scripts trusts old comments again but not the new `Review result` comments; a rollback needs either a republish or a temporary dual-read, which is not part of this change.

### D6. The contributor flow uses the `pr` entry

The baseline `openspec/reviews.json` declares a `pr-tree` profile and maps `reviews.pr` to it; `reviews.apply` and `pipeline.beforeApply`/`beforeArchive` remain for local flows. `prepare` copies the baseline file and sets `pipeline.beforeArchive` to `pr` in the copy; it does not rewrite `reviews.apply`. The session calls `openspec_review` with `review: "pr"`, `baseline: "none"`, the merge base as `base`, the PR worktree and the copied configuration as `configPath`. The locked policy records the `pr` entry and `beforeArchive: "pr"`, so the post-merge `openspec_archive` checks the `pr` record.

Landing reads `pr-review.json` through the same root and key resolution as D2, and the final review uses the `pr` entry. The local owner flow keeps `apply-review.json`; `pr-local-shared.mjs`, `pr-publish.mjs` and `pr-local-land.mjs` need no change unless `review-entry-model` changes how the `apply` record is resolved, which the implementation must audit.

Alternative: keep `review=apply` and point the copy's `reviews.apply` at `pr-tree`. Rejected because the `pr` and `apply` entries would be conflated in the session, the policy and the record names, and `beforeArchive` could not distinguish the PR review from the local apply review.

### D7. Comment shape

The comment keeps the existing title fields (PR number, round, head summary) and the hidden marker with PR, head, round and `format=2`. It contains:

- `**Review result:** passed` or `**Review result:** not passed`, from D3.
- The report summary.
- A findings table with columns `id`, `location`, `problem`, `suggestion` and `state`, where `id` is the `F` number, `state` is the lifecycle state, and no row prints a severity or an internal id.
- A verifications section keyed by `F` number with the verification evidence.
- The out-of-scope and residual-risk sections when present.
- The readiness reasons, with internal finding ids mapped to `F` numbers.
- A state-unavailable note when D2 fell back.

The state words are lifecycle words (open, fixed, verified, deferred, rejected, waived, verified-deferred, verified-rejected). The PR profile disallows deferred and rejected, but historical records and other profiles can carry them, so the renderer maps every state and never falls back to a severity.

### D8. Verification strategy

Watch tests use the existing fake `gh` runner and state fixtures. New tests cover: numbering assignment and reuse, dry-run non-persistence, publishing the map, full-record rendering, record fallback, legacy handoff rendering, result-from-`ready`, old-comment distrust, latest-comment selection, current and old marker formats in `publishComment` and `filterCandidates`, a reason-only internal id, prepare copy with `beforeArchive: "pr"`, and landing's `pr-review.json` gate. The documentation test reads `docs/pr-review.md` and fails when the comment contract, the entry, the record path, the state fields or the recovery commands are missing. The full suite and `npm run verify` remain the completion gate.

No plugin `lib/**` file changes, so no plugin unit test or coverage expectation changes.

Requirement fidelity: every MODIFIED block keeps the main spec's wording and behavior except where this change intentionally changes them. The exceptions are the entry name in every block, the trusted signal in the report and landing blocks, the rewritten `Report handoff and publication` block, the old-format re-emission rule in `Same-head idempotency and new-head rounds`, the added "or reject" in the finding-disposition block, and `Open pull-request polling`'s candidate rule. `Open pull-request polling` also compresses "a pull request recorded as local" to "a local pull request" only to stay under 500 characters. All other blocks are verbatim apart from the entry name.

## Risks / Trade-offs

- **The record layout is internal** → The specification declares the read a same-repository convention, the watch falls back to the report, and the tests pin the path. A future record layout change must update the watch in the same change.
- **Watch state loss restarts numbering** → Numbers are never rewritten on GitHub, and a state reset is an operator action. The fallback order keeps numbering deterministic within a run; the README/documentation states that `F` numbers are PR-local.
- **Old comments are untrusted** → This is the intended migration signal. The poll re-emits old-format commented heads for publication only; open PRs need a new comment for the current head, and owner-review and landing refuse until then.
- **An old marker suppresses a publish** → The marker carries `format=2`, `publishComment` checks only the current format, and the state records the format so the poll re-emits old heads.
- **A reason names an id absent from the record** → The id receives the next `F` number before the reason is printed, so the comment never leaks an internal id and never invents a label.
- **A legacy handoff renders `not passed`** → Conservative by design. The comment names the missing result; rerunning `action=report` writes a full handoff.
- **Record and report disagree** → The record wins for current state, the report supplies this round's evidence, and the comment marks unavailable state instead of merging the two silently.
- **A failed publish after the map write** → The numbers are already persisted, so the retry reuses them; the state stays prepared/failed until the comment succeeds.
- **A `pr` entry missing from the baseline** → The start refuses and names the missing entry; the prerequisite check runs before the schedule is enabled.
- **The `pr` record is read while the reviewer writes it** → The record write is atomic; a parse failure falls back to the report and adds the unavailable note rather than failing the publish.

## Migration Plan

1. Land `review-entry-model` and `review-pass-criteria` first, and archive them.
2. Confirm the archived baseline `openspec/reviews.json` declares `reviews.pr -> pr-tree` with `passCriteria: "nit"`, `allowDeferred: false` and `allowRejected: false`; a missing entry or field fails this change instead of being added here.
3. Deploy the watch, owner-review and landing scripts together; the contributor flow switches to `review=pr` and `pr-review.json`.
4. Re-review each open PR for its current head and publish a new-format comment. The poll re-emits old-format commented heads for publication without opening a new round, and the new comment carries `format=2`; until then, owner-review and landing treat the head as not passing.
5. Rollback: revert the scripts and the baseline `pr` entry. Old comments become trusted again; comments published under the new format are not trusted by the old scripts and need a republish. Revert `pipeline.beforeArchive` in the prepared copy with the scripts.

## Open Questions

None. The record key is fixed to `local#<change>` because the flow selects no store; adding a store later would require recording the key in watch state, which is outside this change.
