# Design: fix-review-status-mode

## Context

See `proposal.md` for the failure. The current projection:

- `projectReview(record, currentObjectHash, extra)` sets `mode: record?.mode ?? 'self'` and `independent: record?.independent === true` (`lib/tools/review.js:332-333`).
- `reviewStatus` reads the policy for the apply branches to decide `policy`, `enabled` and `available`, but never uses `reviewers`; the draft branch reads the record only.
- `openspec_new_change` writes `policy.json` with the draft and apply sections, each carrying `reviewers: 0 | 1`; a legacy change may have no policy or only a draft section.
- `readPolicy` returns undefined for a missing file and throws for unparsable JSON (`lib/review/store.js` `readJson`). The apply status branches already read the policy before returning, so a corrupt file already fails apply status.
- The `review-documentation` requirement enumerates the status fields `docs/review.md` must explain; today it names only `policy`, `enabled` and `available`.

## Goals / Non-Goals

**Goals**

- Status before a start reports the mode that start would record, when a start can occur.
- A disabled or unavailable review keeps `self`/`false`; no caller is told an independent reviewer will run when the review cannot start.
- Recorded reviews keep their recorded values.
- The document requirement names the two fields so the documentation contract is complete.

**Non-Goals**

- No prediction of the mode a first start will migrate from settings for a change with no policy or no apply section. That remains a stated residual divergence.
- No change to the output schema, the record format or the card payload.
- No new policy migration.

## Decisions

### Derive only when a start is possible

`reviewStatus` passes the derived `{ mode, independent }` pair only for a no-record review whose section is enabled and available. The disabled and unavailable branches keep `self`/`false`: no start can occur there, and reporting `reviewer` would reproduce the misleading field this change removes. The apply branch already distinguishes those states, so the condition is local.

Alternative considered: derive for every branch. Rejected because a no-git project would report `reviewer`/`true` while `available: false` and the next action is `openspec_archive`.

### Derive once from the review section

A small helper maps a policy section to `{ mode, independent }`: `reviewers === 1` gives `reviewer`/`true`, anything else gives `self`/`false`. The apply branches pass it through `extra`; the draft branch reads `policy.json` for the no-record case and passes the pair only when the draft section is enabled, keeping `self`/`false` for a disabled section or a missing policy. `projectReview` keeps the derived pair as a fallback only when no record exists.

### Recorded values win

`projectReview` keeps `record.mode` and `record.independent` when a record exists; the derived pair is never applied to a recorded review. This preserves the historical meaning and every existing assertion.

### Missing section keeps self/false

A change with no policy file, or a legacy policy without the requested section, reports `self`/`false` and `policy: false`. The first start builds or migrates the section from plugin settings, which status cannot see; the artifacts record this residual divergence rather than guessing from settings.

### Corrupt policy fails both status kinds

The draft status branch now reads `policy.json` for a no-record review. A corrupt file throws, exactly as apply status already does, so both kinds share one behavior. The design states this instead of claiming the read is non-failing; a test asserts the parity.

### The documentation contract grows with the field surface

`docs/review.md` is governed by `review-documentation`, whose enumeration names the status fields. The change adds a delta there so the two new fields are required by the main spec, not only by a test phrase list.

## Risks / Trade-offs

- A corrupt `policy.json` now fails draft status where it previously returned the not-started projection. Mitigation: apply status already fails the same way; the parity test makes the behavior deliberate.
- A legacy change can report `self`/`false` while its first start records `reviewer`/`true` from settings. Mitigation: documented as out of scope in the proposal and here; resolving it would require reading settings that are not yet locked.
- A policy that enables a review but carries no `reviewers` field defaults to `0` on read, so status and start agree on `self`/`false`.
- A recorded review whose policy was later edited keeps its recorded values, which may differ from the current policy; that is the contract and the existing behavior.

## Migration Plan

None. The status output changes only for a not-started review whose section is enabled and available and whose policy sets `reviewers: 1`; disabled, unavailable, missing-policy and recorded cases keep their current values.

## Open Questions

None.
