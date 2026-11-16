# Design: Enforce finding dispositions before a review round advances

## Context

See `proposal.md` - Why. Three facts bound the approach.

- `openspec_review` currently owns two write paths that consume `dispositions`: `dispose` and a finding `waive` (`disposeReviewFinding`). `start` and `resume` never read the field, so a caller that passes it receives no error and no effect.
- `resume` only inspects the record's rounds: it reuses the latest round when that round has no report and opens the next round when it has one. It does not inspect `record.findings`.
- The reviewer's `own-report` path reads `latestRound(record)` and ignores the `round` argument, and `status` does not expose findings. A reviewer that needs the recorded state can only read `openspec/.review/.../review.json` through the workspace.

The review record is the single source of truth for both sides; the fix keeps that model and adds gates on the changer path rather than duplicating state.

## Goals / Non-Goals

Goals:

- Make the misuse that produced the `upgrade-openspec-cli-2-0-0` round-2 record fail loudly and early.
- Give the reviewer a supported, read-only way to see finding status and earlier reports.
- Keep the existing round-reuse, passing-review short circuit and apply base behavior unchanged.

Non-Goals:

- No migration of existing review records; a record with open findings must be disposed before it can resume.
- No new reviewer write path and no change to the reviewer catalog.
- No packaging, profile reinstall or `dist/` update in this change.

## Decisions

### Reject dispositions at the tool boundary

`start` and `resume` reject a `dispositions` argument before reading the review record. The alternative, documenting the restriction only, leaves the silent no-op in place; the field is already a registered schema property, so the schema alone cannot prevent the call. The error names `action: "dispose"` (and the finding `waive` form) so a caller can repair the call without reading the source.

### Gate resume on `open`, not on readiness

The gate rejects a new round while any recorded finding has `status === "open"`. Readiness treats `deferred`/`rejected` as handled for non-blocking findings; `fixed`/`verified`/`waived` close a finding. `open` is the only state that means the changer has not acted, so the gate keys on it.

The check runs inside the review lock, after the record is re-read and before a round is written or the reviewer is woken. A rejected resume therefore leaves the round counter, object hash, brief and slot untouched. The check applies only when the latest round already has a report: a `resume` that reuses an unreported round only rebinds the object hash and must keep working.

`lib/review/readiness.js` must agree with the gate. Today `needsRound = stale || anyFindingFixed` makes `status` name `resume` even while a finding is open, which the new gate would refuse. The fix makes dispose win: `needsRound = (stale || anyFixed) && !anyOpen`, and the `tool-surface` requirement "Review next actions name the round entry" is amended to state that precedence. Unit coverage covers stale+open and fixed+open; draft and apply integration cases exercise the full loop.

### Reject dispositions on `start` too

The first round has no recorded findings, so a `dispositions` array on `start` can only be a caller error. Rejecting both entry points keeps one rule and avoids the same silent no-op moving to `start`. An empty array never reaches the handler because the parameter schema's `minItems: 1` rejects it; a scenario records that behavior.

### Reviewer reads a summary, not the whole record

`target: "findings"` returns a projection: id, severity, status, title, first round, verification round, last verification, plus a per-round verdict/report summary. Full finding text stays available through `own-report` with a `round`; returning the whole record would duplicate `review.json` and grow with every round. `own-report` keeps `latestRound` as the default so existing calls are unchanged, and reports an explicit error when the requested round is missing or has no report. The two behaviors are separate requirements so neither description approaches the 500-character limit.

### Keep the original requirement blocks short

The delta validator exempts MODIFIED bodies from the 500-character check, but the archive merges them into the main specs and the next strict validation fails. New read targets therefore go into ADDED requirements, and "The reviewer tool is exposed only through the preset" stays byte-identical. The two requirements that must change are MODIFIED with measured bodies: "Resume continues a recorded review" gains the qualifier "and no recorded finding is open" (488 characters) and "Review next actions name the round entry" is rewritten for the dispose precedence (397 characters). Task 6.1 measures every delta description before archive.

### Refuse only the statuses that need a repair

The `verified-fixed` refusal is scoped: `open`, `deferred` and `rejected` findings get the current status plus the `action=dispose` step. A `verified` or `waived` finding is already closed; its refusal says so and does not tell the changer to dispose it again, because `disposeFinding` would overwrite the closure and lose the verification round or the user's waiver.

### Keep the error message in English and test its substrings

Tool errors in this plugin are English. The `verified-fixed` refusal now reports the actual status and the repair action. Tests assert the stable fragments: the finding id, the status word, `action=dispose` and `status=fixed`.

### Version 0.6.1 without repacking

The source version moves to 0.6.1 so the packaged skills' `generatedBy` names the code that ships them. The profile currently installs 0.6.0; this change does not repack or reinstall, so 0.6.1 is verified by the source suite and its own draft/apply review runs on the installed 0.6.0 copy. The new gates therefore do not run during this change's review; the regression tests are the acceptance evidence. The recorded intent says 0.5.0 because the profile used 0.5.0 when the plan was drafted; the profile moved to 0.6.0 before this change started, and neither version contains the 0.6.1 logic.

## Risks / Trade-offs

- **Existing records with open findings stop resuming** → Document the dispose-first step; the error names the open ids and the action. This is the intended tightening.
- **A caller that relied on resume carrying dispositions breaks** → The behavior was a documented-by-accident no-op; the error names the correct action in the same call path.
- **The gate only covers new rounds** → An unreported round can still be rebound; that path creates no findings and no reviewer report, so it cannot hide an undisposed finding.
- **The gate runs on the changer path only** → A reviewer cannot dispose findings; readiness still blocks apply until every finding is closed, so the two sides cannot diverge.
- **Readiness and the gate drift apart** → `readiness.js` gives dispose precedence and unit tests pin stale+open and fixed+open; the draft and apply integration cases exercise the real loop.
- **A merged requirement exceeds 500 characters after archive** → The new reviewer reads go into ADDED requirements; the resume and next-action requirements are MODIFIED with measured bodies (488 and 397 characters); the integration task measures every delta description.
- **The installed copy is 0.6.0, not the source under review** → Reviews of this change use the old tool surface; the new read targets and gates are exercised only by the source suite until a later pack/install.
- **The draft brief does not advertise the new read targets** → The reviewer is still told only about the brief and the report; the tool description and the refusal message are the discovery path. Updating the brief would add a second prompt surface and is left to a later change.
- **Error-message churn breaks existing assertions** → Update the affected tests in the same change and assert substrings rather than full sentences.
- **Existing cap and wake tests resume with an open finding** → The plan disposes the finding first in those cases, preserving what they actually test (the cap and the failed wake).

## Migration Plan

No data migration. For an existing record with open findings, run `openspec_review` with `action: "dispose"` (single `id` or the `dispositions` batch) before the next `resume`. Rollback restores the previous code and version files; review records are unchanged by the new gates because a rejected call writes nothing.
