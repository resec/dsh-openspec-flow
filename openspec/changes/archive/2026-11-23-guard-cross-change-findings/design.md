# Design: Guard review findings against another change

## Context

See `proposal.md` - Why. Three facts shape the approach.

The report contract is shared by self-review and independent review, and by draft and apply. Both submission call sites end in `submitReport`, which validates the report with `assertReport` before it writes anything. `assertReport` validates a finding's `location` only as a non-empty string, so any path passes today. The review record already names its change, so a submission can scope itself without new state.

The reviewer reads the project root: the preset has `read`, `grep` and `glob`, and the activation prompt says to read the artifacts and the workspace. The apply object is the committed tree, which can contain another change's committed planning directory. Nothing in the brief tells the reviewer that such a directory is outside the review, and the flow rule does not either.

The apply review's plan axes are about the reviewed change. A concern about another change is evidence for `outOfScope`, not an instruction to edit that change; the landed stale-round watch treats an edit to a change in draft as damage, not as a review outcome.

## Goals / Non-Goals

**Goals**

- Refuse a report that demands a change in another change's directory, before anything is stored, in both reviewer modes and both review kinds.
- Keep `outOfScope` as the accepted way to record the concern, and leave the report contract for every other location unchanged.
- State the boundary in the two briefs the reviewer actually reads and in the flow rule the agents receive.
- Make the refusal actionable: it names the finding, its location and the `outOfScope` alternative.

**Non-Goals**

- A land gate or any check of the committed tree's paths. The change is refused where the demand is recorded.
- Scanning a finding's prose (`problem`, `suggestion`) for another change's path. Only `location` is checked; the brief and policy state the intent, and prose is not a reliable path field.
- Resolving a location against the filesystem or a project root. The check attributes the `openspec/changes/` segment in the normalized text; a location without that segment is accepted, and an absolute path is caught only when it carries the segment.
- Changing the reviewer tool schema, the record layout or the `outOfScope` limits.
- Preventing a reviewer from reading another change's files; the boundary is about findings, not reading.

## Decisions

**One scope check in the shared submission path.** `assertReport` gains an optional `scope` with the reviewed change's name; `submitReport` passes it from `record.change`. This covers `openspec_review action=self-report` and `openspec_reviewer action=submit`, draft and apply, with one implementation. Alternative: check in each tool entry point. That duplicates the parser and leaves the stale-close path or a future caller uncovered. A record without `change` skips the check, so old records keep their behavior; every record written by the current code carries the field.

**Parse the location as a normalized path, not a prefix.** The checker strips a trailing `:line` or `:line:column`, converts backslashes, normalizes the raw path with `posix.normalize`, and then resolves a remaining leading `..` against `openspec/changes/<change>/` before normalizing again. It then finds the `openspec/changes/` segment at any depth and compares the first segment after it with the reviewed change. `archive/` is treated as another change because an archived change is not being reviewed. This catches a leading path, a `./../` or `specs/../../` form after normalization, a nested-root repository-relative path such as `apps/web/openspec/changes/<other>/...`, an interior `..` such as `openspec/changes/<change>/../<other>/...`, and an absolute path that carries the segment. A location with no `openspec/changes/` segment is accepted: change-relative artifacts, main specs, code, documentation and section headings stay valid. Alternative: resolve the location against the recorded `changeRoot` and its parent. That needs the repository root, which a nested OpenSpec root and a store change do not give; the normalized segment comparison does not. A prefix-only comparison is rejected because a nested root and an interior `..` both hide the target behind other segments.

**Refuse instead of moving the finding to `outOfScope`.** A report is stored once, and a blocking finding is what makes a `changes-requested` verdict valid. Moving it silently could leave `changes-requested` with no blocker, which `assertReport` refuses, and it would rewrite the reviewer's evidence without the reviewer seeing it. Refusal lets the reviewer resubmit the same concern as an `outOfScope` entry, where it is visible and harmless. Alternative: strip the finding and append its title to `outOfScope`; rejected because it changes the verdict/finding relationship and hides the original location.

**The brief line is a rule, not a new section.** The apply brief already says the whole committed tree is the review object; the new line explains that another change's directory is not a review target despite appearing in that tree. The draft brief already says to review only the change artifacts; the new line names the cross-change case. One rule line in each brief keeps the object description intact and is covered by the existing brief tests.

**The flow rule carries both sides.** Step 4 (draft) and step 6 (apply) gain the reviewer boundary: no requirement to change another change's artifacts, and no requirement to edit a change whose draft round has no report; the concern belongs in `outOfScope`. The existing sentence that the changer must not edit while a draft round is open stays. The rule is advisory; the report refusal is the hard gate.

**The document is updated with the behavior.** `docs/review.md` is the reference checked by the review-documentation tests, and a reader of the report contract must see the boundary and the refusal.

## Risks / Trade-offs

[A reviewer can still ask for a cross-change edit in the finding's prose while pointing `location` at its own artifact] → The refusal is a path check, not semantic understanding. The brief and the flow rule state the boundary, and the remaining case is visible in the report; a later change can scan prose if the path check proves insufficient.

[An absolute path without an `openspec/changes/` segment is not attributed] → It is accepted; the documented location hint is repository-relative, and the checker does not resolve the filesystem.

[A store-backed change's directory has no `openspec/changes/` segment] → The guard does not attribute store paths; such a change keeps the current behavior. Closing that gap needs a store-aware root, which this change does not add.

[A path containing `openspec/changes/` as a coincidental segment] → It is treated as another change and refused. The segment is reserved for change directories, and a conservative false positive is preferable to accepting a demand to edit another change's material.

[Older records without a recorded change] → The scope check is skipped, so a legacy record keeps the previous acceptance. The refusal applies to every record created by the current code, and a record missing its change is already outside the normal shape.

[The refusal arrives after the reviewer has finished reading] → The reviewer resubmits one report with the concern in `outOfScope`; the review round is not consumed and no finding is stored. The error text names the filed location and the alternative.

## Migration Plan

No data migration. The check runs on the next submission; existing reports and findings are untouched. A record written before this change without a recorded change keeps the previous acceptance permanently, because `submitReport` does not backfill `change`; every record written by the current code carries it. Rollback is a code revert; the refusal leaves no new fields on disk.

## Open Questions

None.
