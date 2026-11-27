# Design: review-pass-criteria

## Context

See `proposal.md` for the motivation. The current review gate hard-codes `critical` and `major` as the blocking severities in `lib/review/report.js` and uses that rule in readiness, report validation and dispositions. Profiles currently require `enabled`, `reviewers`, `waitMinutes` and `reviewerModel`, and `openspec_init` writes one directory profile for draft and one tree profile for apply. The policy locks the resolved review sections; its schema version is currently `2`.

This change is planned after `review-entry-model`, which is expected to generalize review entries and raise the policy schema from `2` to `3`. The pull-request report format is a separate change and is not touched here.

### Entry-model text merge

The delta is drafted against the current main specs, but `review-entry-model` changes the shared requirements before this change applies. The merge is therefore part of this change, not a rebase: every shared MODIFIED block SHALL retain the archived entry-model description unchanged, and any pass-criteria fact SHALL go into a new scenario or a new ADDED requirement. The only description edit allowed is deleting a phrase the pass criteria directly contradict, such as `all dispositions`; no description may grow. If an archived description already exceeds 500 characters, its pass fact SHALL go to a scenario or ADDED requirement and the description SHALL NOT be merged into.

The six shared requirements and the facts each must retain are:

- `Apply review uses the draft base and report lifecycle`: entry-named apply policy section, the `review` tool value and the `pipeline.beforeApply` default draft baseline.
- `openspec_init writes the default review configuration`: default document shape, entry keys and `pipeline.beforeApply` / `beforeArchive`.
- `The document matches configuration defaults`: documented default profiles, entry keys and pipeline.
- `The README states the project review file`: README entry facts, profile names and pipeline.
- `The read-only configuration page registers and reports`: page entries and pipeline.
- `The review document states the shared brief report contract`: brief entry facts and the contract's entry naming.

The apply-readiness threshold is a new ADDED requirement, `Apply readiness follows the pass criteria`; the shared apply-report description keeps its archived text and loses only `all dispositions`. Task 0.1 names these six requirements, performs the merge before apply, adds a read-back assertion for each retained fact, runs strict validation and the requirement-length gate, marks itself done, then resumes the draft review before apply starts at task 1.1. A merge that replaces the entry-model facts with the current text, or grows a shared description, SHALL NOT be accepted.

## Goals / Non-Goals

- Goal: let a profile choose the severity floor that fails a review and choose whether `deferred` and `rejected` dispositions are allowed.
- Goal: make readiness and report verdicts use the same floor so internal state and published results cannot disagree.
- Goal: add explicit terminal states for confirmed `deferred` and `rejected` dispositions.
- Goal: keep old configuration, policies and records readable without rewriting them.
- Non-goal: change the severity enum, the finding id format, the review object types, the entry model, or the pull-request scripts.
- Non-goal: introduce a numeric or per-finding threshold; the threshold is one severity value.

## Decisions

### Threshold predicate

Use one ordered severity list: `critical > major > minor > nit`. A finding is **in-threshold** when its severity rank is less than or equal to `passCriteria`. The resolved criteria are:

- `passCriteria`: `critical`, `major`, `minor` or `nit`; default `major`.
- `allowDeferred`: boolean; default `true`.
- `allowRejected`: boolean; default `true`.

`normalizeProfile` accepts the three keys as optional, validates their values, and records the resolved values in the resolved profile. `reviewSection` supplies the defaults when the fields are absent. `openspec_init` writes all three explicitly in both default profiles so a new project sees the policy it gets. The three fields are not required, unlike the five existing profile parameters; this is the deliberate exception to the current "every parameter is required" rule.

The threshold is one severity value rather than a set because a set would add a second representation of the same order and make "at or above" ambiguous in refusals. Invalid values are a configuration error and name the field and accepted values.

### Policy lock

Every review section records `passCriteria`, `allowDeferred` and `allowRejected` at lock time, after defaults are applied. The policy remains the authoritative snapshot; a later project-file edit cannot change a locked change. A policy written before these fields existed is read with `major`, `true` and `true` and is not rewritten. `configHash` includes the resolved fields for new policies; legacy policies keep their recorded hash.

`POLICY_SCHEMA_VERSION` becomes `4` when `review-entry-model` has archived at `3`. The implementation SHALL read the actual version in `lib/review/policy.js` at apply time: if the entry model did not raise it, this change raises the current version by one and records the actual value in the implementation notes. The design's expected values remain `2 -> 3` for the entry model and `3 -> 4` for this change. No relock action is added.

### Finding state machine

The finding statuses become:

`open`, `fixed`, `verified`, `verified-deferred`, `verified-rejected`, `deferred`, `rejected`, `waived`.

Transitions:

| From | Trigger | To |
| --- | --- | --- |
| open | `dispose fixed` | fixed |
| open | `dispose deferred` (below threshold, switch on) | deferred |
| open | `dispose rejected` (below threshold, switch on) | rejected |
| any non-terminal | user `waive` | waived |
| fixed | verification `verified-fixed` | verified |
| deferred | verification `verified-deferred` | verified-deferred |
| deferred | verification `still-open` | open |
| rejected | verification `verified-rejected` | verified-rejected |
| rejected | verification `still-open` | open |
| verified | verification `regressed` | open |
| verified-deferred | verification `regressed` | open |
| verified-rejected | verification `regressed` | open |

`closed()` considers `verified`, `verified-deferred`, `verified-rejected` and a `waived` finding with a user approval and waiver text as resolved. `fixed` is not resolved until verified; `deferred` and `rejected` are not resolved until their matching verification. `verified-deferred` and `verified-rejected` are terminal, so a report that tries to verify them again is refused as already closed.

The verification validator becomes disposition-aware:

- `verified-fixed` is accepted only for a `fixed` finding.
- `verified-deferred` is accepted only for a `deferred` finding.
- `verified-rejected` is accepted only for a `rejected` finding.
- `still-open` is accepted for a `deferred` or `rejected` finding and returns it to `open`.
- `regressed` is accepted for a `verified`, `verified-deferred` or `verified-rejected` finding and returns it to `open`.
- A `fixed` finding still needs a verification before the next round; a `deferred` or `rejected` finding does not.

The record keeps `verifiedInRound`, `verifiedInRoundToken` and `verifiedAt` for the new terminal statuses, so status, findings reads and cards can report the verification round. The record also keeps the disposition `note` and the `lastVerification` value as it does today.

### Disposition gates

`disposeFinding` needs the resolved criteria. A `deferred` disposition is refused when `allowDeferred` is false or the finding is in-threshold; a `rejected` disposition is refused when `allowRejected` is false or the finding is in-threshold. The refusal leaves the finding unchanged. `fixed` and user `waived` remain available for every severity. The existing batch path validates all entries before writing, so one refused entry leaves the whole batch unchanged.

The refusal message names the finding, its severity, the threshold, the closed switch (when applicable) and the allowed statuses (`fixed`, `waived`, and the allowed below-threshold dispositions). The tool-surface requirement owns this refusal; the change-review requirement owns the lifecycle rule. The lifecycle MODIFIED block keeps its pre-existing `Blocker is deferred` scenario because a MODIFIED block must retain the current scenarios; the ADDED `Dispositions honor the pass criteria` requirement owns the gate rule, and the lifecycle description no longer restates it.

### Readiness and report verdict

Readiness needs the resolved criteria without reading the policy at every call site. When a round opens, the review record stores a `criteria` object with the three resolved values, copied from the policy. Records written before this change have no `criteria`; readers treat that as `major`, `true` and `true`. The policy remains the source; the record copy is the round's audit value and is not rewritten when the project file changes.

`draftReadiness` changes from "every finding must be closed" to "every in-threshold finding must be closed". A below-threshold finding does not add a readiness reason whatever its status, including `open`, `deferred` and `rejected`. The length gate, execution gate, object hash, `blocked` draft handling and coverage-gap rule keep their current behavior. The existing `open` calculation still drives the `dispose` next action when the review is not ready for another reason; a below-threshold open finding is disposed before a later `resume`, because `resume` still requires every open finding to be disposed.

`assertReport` uses the same resolved set. A `pass` report is refused when an in-threshold finding is not `verified`, `verified-deferred`, `verified-rejected` or user-waived. A `changes-requested` report is refused when no in-threshold finding is unresolved; a report with only below-threshold findings must use `pass` and list them. `blocked` keeps its current meaning and its draft special case. The shared `submitReport` path passes the record's resolved criteria into `assertReport`; it validates self-reports and independent reviewer submissions the same way.

### Brief, status and card surfaces

The brief's report contract lists the new verification statuses, names `fixed`, `deferred` and `rejected` findings as verification candidates, states the matching confirmation statuses, states the profile's `passCriteria`, `allowDeferred` and `allowRejected`, and states the verdict rule in terms of that threshold. A reviewer therefore knows which findings can be verified or deferred before it writes a report. The reviewer `read` of `findings` reports the new statuses and their verification round.

`summarizeFindings` adds `verifiedDeferred` and `verifiedRejected` counts. Its `blocking` count becomes the number of unresolved in-threshold findings, not the number of unresolved `critical`/`major` findings; that keeps the field's meaning aligned with the configurable gate. The `openspec_review` output schema adds both counts and keeps `additionalProperties: false`, so the schema and every consumer must be updated together.

The card payload already carries the finding list and the summary; the new statuses flow through unchanged, and the counts object gains the two fields. The client's collapsed summary remains a per-severity count and is not changed; the expanded finding rows show the raw status. The read-only configuration page adds `passCriteria`, `allowDeferred` and `allowRejected` to each profile row.

### Repository configuration

`openspec/reviews.json` gets explicit `passCriteria: "major"`, `allowDeferred: true` and `allowRejected: true` on `standard-directory` and `standard-tree`. The `pr-tree` profile introduced by `review-entry-model` gets `passCriteria: "nit"`, `allowDeferred: false` and `allowRejected: false`. This change does not add the entry mapping or a second PR profile; those belong to the entry-model change. If `pr-tree` is absent at apply time, the implementation coordinates with that change instead of inventing a profile.

### Compatibility

- A project file without the three fields remains valid and resolves to the defaults. A file with an invalid value fails the read and names the field.
- A policy without the three fields remains readable and resolves to the defaults; it is not rewritten.
- A review record without `criteria` uses the defaults. The behavior change is intentional: an open below-threshold finding no longer blocks readiness under the default `major`.
- A legacy record with `deferred` or `rejected` findings keeps those statuses. Under `passCriteria: "nit"` (the PR profile) they are in-threshold and unresolved, so readiness fails until they are verified or user-waived; the PR flow already forbids new deferred/rejected dispositions through its switches.
- The `findings` summary gains two fields and changes `blocking` semantics. The plugin's own status schema, tests and client are updated together; an external consumer that hard-codes the old shape must accept the additive fields.

## Risks / Trade-offs

- [Two meanings of "blocking"] -> `blocking` now counts unresolved in-threshold findings, while severity names remain the report vocabulary. The documentation states the new meaning and the status requirement names it; tests cover both a `minor` threshold and the default.
- [Below-threshold open findings stop blocking readiness] -> A reviewer may pass with open nits. This is the requested threshold behavior; `pass` reports list them and `resume` still requires them disposed before a later round. The design keeps them visible in findings, cards and status.
- [Policy schema conflict with `review-entry-model`] -> The implementation reads the actual schema version and raises it by one; the design records the expected `3 -> 4`. If the entry model changes the policy shape, the delta is merged with the archived spec before apply, not rebased.
- [Legacy deferred/rejected records under a `nit` threshold] -> They become in-threshold and unresolved. The refusal message and the docs give the verification and user-waiver routes; no automatic migration changes a recorded status.
- [Status schema is closed] -> Adding counts requires a schema change in the same commit as `summarizeFindings`; tests validate the result against the registered schema.
- [Entry-model dependency] -> This change's shared blocks are merged with the archived entry-model text (task 0.1). If the entry model is not archived first, the merge and the implementation wait; replacing its entry facts with the current text is refused by the merge check. The merge runs before the draft review is ready: task 0.1, then `openspec_review action=resume review=draft`, then apply at 1.1.
- [Shared description growth] -> The merge keeps each archived description unchanged and puts pass-criteria facts in scenarios or the ADDED apply-readiness requirement; task 0.1 runs the requirement-length gate and the read-back assertions for the six shared requirements.

## Migration Plan

1. When `review-entry-model` archives, perform task 0.1 before apply: merge its six shared requirements with the rules above, add the read-back assertions, run strict validation and the requirement-length gate, mark task 0.1 done with `openspec_mark_task_done`, then run `openspec_review action=resume review=draft` and wait until the draft review is ready. Apply starts at task 1.1.
2. Implement the configuration fields and defaults, then policy locking and record criteria, then the lifecycle and dispositions, then readiness and report validation, then the status/card/page surfaces, then the docs and repository configuration.
3. No data migration: old files and policies resolve to the defaults. No relock. The repository's `openspec/reviews.json` is edited deliberately.
4. Rollback: revert the plugin. A policy already locked at the newer schema version may not be understood by an older plugin; complete or abandon affected changes with the newer plugin before rolling back, or test the older plugin against the recorded policy first.

## Open Questions

None. The schema-version coordination is handled by the rule above; the actual value is recorded when the entry model is known.
