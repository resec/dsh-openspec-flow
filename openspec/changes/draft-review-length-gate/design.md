# Design: draft-review-length-gate

## Context

Draft review currently validates the change with the bundled validator in non-strict mode, then builds the brief from the change artifacts. Apply review validates the committed change strictly. With OpenSpec 2.0.0, both checks miss a MODIFIED requirement whose description grows past 500 characters: the delta validator checks only ADDED descriptions, and the main-spec warning appears only after archive.

The official spec instruction says not to compress existing text. The change is to move that rule into the draft phase: measure the descriptions, explain the official handling, and refuse readiness while this change makes a description grow.

## Goals / Non-Goals

Goals:

- Detect an ADDED description over 500 characters and a MODIFIED description that grows over 500 characters relative to its main-spec baseline.
- Carry the measured values and the official handling in the draft brief.
- Block `openspec_apply_next` while a blocking result is recorded.
- Recheck at the first apply entry and at apply review entry so a later plan edit or a changed baseline cannot bypass the result.
- Keep unchanged or shortened legacy descriptions unblocked before apply starts.

Non-goals:

- No automatic truncation, compression or split.
- No second Markdown parser.
- No block on a legacy overlong requirement that this change did not grow.
- No post-apply length gate when apply review is disabled or unavailable; that policy already opts out of apply review.
- No new tool, parameter or review record file.

## Decisions

### Read the CLI's `show` output

The check calls `runOpenSpec` with `withStore(['show', change, '--type', 'change', '--json'], store)` and, for each capability that has a main spec, `withStore(['show', specId, '--type', 'spec', '--json'], store)`. The delta projection provides `operation`, `requirements[].name`, `requirements[].text` and RENAMED `rename.from` / `rename.to`; the main-spec projection provides `requirements[].name` and `requirements[].text`.

The main-spec path is `join(dirname(dirname(context.changeRoot)), 'specs', ...specId.split('/'), 'spec.md')`. The change directory is `<planning root>/changes/<change>`, so its grandparent is the planning root for both a project and a store. The check calls the spec `show` only when `existsSync` returns true for that path; a missing main spec is a new capability with no baseline, not a failure. It uses the full `delta.spec` id, including a nested `<area>/<capability>` path, rather than the first path segment.

`--type change` avoids the change/spec name collision, and `withStore` keeps a store-backed change on its selected store. A CLI status payload instead of the expected projection is thrown as the existing `errorFromStatus` error; it is not treated as an empty delta set.

The alternative is importing the CLI's parser or reimplementing the Markdown parser. Both would make the plugin responsible for a grammar the pinned CLI already defines. The public projection is the same reader the CLI uses for `show`, and the plugin already pins the CLI version.

A description is the `text` field; its length is the character count of that field. The 500-character constant is defined once in `lib/review/length.js`, not copied into the brief.

### Classify against the main-spec baseline

For every delta requirement:

- ADDED: block when `text.length > 500`.
- MODIFIED: find the main-spec requirement with the same name. If the same change also renames it, follow `rename.to` -> `rename.from` until a baseline is found, with a visited set to stop a cycle. Block when `text.length > 500` and `text.length > baseline.length`.
- MODIFIED with no baseline: leave it to the existing validator and archive checks; do not guess a length failure.
- MODIFIED with a baseline and `text.length <= baseline.length`: record a non-blocking legacy entry when it is still over 500.

A legacy entry is informational. It does not change readiness and does not ask the author to edit this change; the official handling says a dedicated change owns that split.

### Record the result and gate readiness

The draft record gains one additive field:

```json
{
  "length": {
    "limit": 500,
    "blocking": true,
    "issues": [
      {
        "kind": "added-overlong | modified-growth",
        "spec": "development-workflow",
        "path": "specs/development-workflow/spec.md",
        "requirement": "Strict artifact validation gate",
        "operation": "MODIFIED",
        "length": 656,
        "baseline": 455
      }
    ],
    "legacy": [
      {
        "spec": "change-review",
        "path": "specs/change-review/spec.md",
        "requirement": "Draft readiness gates apply",
        "operation": "MODIFIED",
        "length": 650,
        "baseline": 650
      }
    ]
  }
}
```

The record schema version stays at 1. A record written before this change has no `length` field; readiness treats that as unchecked, but the first apply entry recomputes the result before deciding. Resuming a draft review computes the field and writes it.

`draftReadiness` adds a reason only when `record.review === "draft"`, `options.applyStarted !== true`, and `record.length.blocking === true`. Every draft call site passes the existing `applyStarted(directory, record)` result through `readinessOptions`; `projectReview` and the status/wait paths use the same value. The readiness function does not infer the freeze from `record.applyBaseCommit`, because a store-backed change can start apply without recording a base. The reason names the blocking count and points at the brief. Apply review records do not carry this field, so their readiness is unchanged.

For a length-only block with a recorded report and no open finding, the next action is `openspec_review action=resume review=draft`, because the author must edit the artifacts and resume; there is no finding to dispose. Before a report is recorded, `draftReadiness` returns the same string as `gateAdvice`: `openspec_review action=wait` in reviewer mode or `openspec_review action=self-report` in self mode for a draft, with `review=apply` appended for an apply record. It does not fall back to `dispose`. An open finding still returns `dispose`. `draftReadiness` includes the length-only state in its `needsRound` branch only when the report exists.

Draft start and resume remain allowed while the result is blocking. The brief is the review feedback; the host gate is the deterministic backstop. This avoids a start refusal that would hide the measured guidance from the author.

### Recheck at the first apply entry and apply review entry

The stored result can become stale when the main specs change. `assertDraftReviewReady` already computes `started = applyStarted(directory, record)`. Before apply starts, it recomputes the result from the current main specs and throws the same gate error when it is blocking. This also covers a legacy record that has no stored `length` field. After apply starts, it does not recheck the frozen draft, so a resync is not refused by a result the changer can no longer resolve through the draft; `applyReviewEntry` rechecks the current artifacts before opening a start or resume round instead.

The recomputation is read-only. It does not rewrite the draft record outside the existing review lock; the gate error carries the current report. A later draft resume writes the current report.

### Put the official handling in the brief

`buildDraftBrief` accepts the report and, when it has blocking or legacy entries, renders a `## Requirement length` section:

- a table of path, requirement, operation, length and baseline;
- the blocking or legacy classification;
- the official handling, imported from the same module as the gate error:
  - do not compress, trim or rewrite existing text;
  - keep one behavior per requirement;
  - move examples and edge cases into scenarios;
  - split an existing long requirement only in a user-requested dedicated change that preserves its header and every scenario and adds the removed behaviors as ADDED requirements.

The brief does not include the full spec bodies; the reviewer reads the artifacts themselves. The gate error uses the same renderer, so a `reviewers: 0` changer that never sees the brief still receives the official handling and the draft-resume action.

### Keep the gate deterministic in both reviewer modes

With `reviewers: 0`, a self-report can ignore the brief. With `reviewers: 1`, the reviewer may miss the section. The readiness gate is the same in both modes: a passing report cannot make a blocking result ready. The brief instruction tells the reviewer to report a blocking length finding, but the host does not depend on that report.

### Restore and split the compressed pre-push requirement

Commit `71fa884`, made after the draft seal and before the implementation commits, shortened the merged `Strict artifact validation gate` description from 653 to 418 characters. The rewrite dropped the `coverage-gate` reference and the "any other stamp outcome" obligation without a delta, task or test. The apply review flagged it as an unowned main-spec change and a contradiction with this change's own no-compression rule.

The user approved a plan change to restore the behavior and split it in this change, which is the dedicated length change:

- `## MODIFIED Requirements` keeps the `Strict artifact validation gate` header and every existing scenario, and replaces the compressed body with the validation and lab-gate obligations.
- `## ADDED Requirements` adds `Coverage stamp verification` with the restored `coverage-gate` reference and the non-verifying-stamp obligation, plus its own scenarios.
- The archive therefore replaces the compressed body with two requirements, each within the 500-character limit, and no normative clause is lost.
- `specs/development-workflow/spec.md` is covered by the recorded plan-change waiver. A regression test reads the active delta, and after archive the main spec, so the restored clauses remain checked.

This is not a compression workaround: the existing scenarios stay in place, and the removed behavior is added as a new requirement per the official split procedure.

## Risks / Trade-offs

- [The `show` text length diverges from the validator's body length] → The CLI is pinned; the boundary tests assert 500 and 501 through the same `show` projection and the integration test asserts the measured value. If a future CLI changes the projection, the pinned-version contract test fails before release.
- [A rename chain is ambiguous] → Follow only the recorded RENAMED pairs with a visited set. If no baseline resolves, skip the length decision and leave it to the existing validator and archive checks.
- [A legacy overlong requirement still fails archive strict] → This change intentionally does not make the author compress it. The brief names it as legacy and points at a dedicated split change.
- [The main spec changes after the draft round] → The first apply entry and `applyReviewEntry` recheck the current baseline; a stale stored result cannot let apply through.
- [A blocking result blocks a draft review that has no fix yet] → That is the gate's purpose. The brief and the gate error give the official options; the author can change the artifacts and resume, or ask for a dedicated split change.
- [The draft is frozen after apply starts] → The draft no longer adds the length reason when the shared `applyStarted` value is true, including a store-backed change with no base, and the apply entry skips the recheck; apply review performs it and the author can edit the plan with the existing waiver.
- [Apply review is disabled or unavailable after apply starts] → No post-apply owner performs the length recheck. That policy already opts out of apply review, and the first apply entry checked the plan before implementation; the limitation is stated rather than adding a second gate that would contradict the policy.
- [The restored pre-push split is a plan change during apply] → The user approved it in writing and the waiver lists `proposal.md`, `design.md`, `tasks.md` and `specs/development-workflow/spec.md`; the apply review must accept exactly those changed files.

## Migration Plan

No data migration. The field is additive and optional. Existing draft records remain readable; the first apply entry recomputes the result, and resuming records it. Rollback removes the field from new records, the brief section and the readiness reason; no artifacts depend on it.

## Open Questions

None.
