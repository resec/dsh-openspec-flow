## Context

See `proposal.md` for the motivation. The relevant current state:

- `applyReviewEntry` reads the draft record and, when the policy's draft section is enabled, refuses a missing record, reads `intent.md`, and computes plan drift and waiver coverage (`lib/tools/review.js`).
- The apply base is resolved as explicit `base`, then the recorded seal commit, then `git merge-base HEAD origin/main`.
- The apply record has no field that states which baseline it used.
- `ensureReviewIgnored` only checks the nested `openspec/.gitignore`; it writes the file before `assertReviewIgnored` checks `git check-ignore`.

## Goals / Non-Goals

**Goals**

- Let a caller run one apply review against a committed branch with no draft record, without changing the default lifecycle.
- Keep the default apply review, its readiness contract and its archive gate unchanged.
- Stop the plugin from creating an untracked `openspec/.gitignore` when git already ignores the review directory.

**Non-Goals**

- No GitHub, pull request, remote, polling or comment support in the plugin.
- No change to `openspec_apply_next`, the seal commit, the archive gate or the default draft-policy gate.
- No root `.gitignore` change in this change; the repository-level rule is a separate change.
- No change to reviewer selection; the caller still controls `reviewers`.

## Decisions

### A baseline enum, not a boolean

`baseline` is an enum with `draft` and `none` rather than a boolean such as `skipDraft`. The enum states the review's baseline explicitly and leaves room for a future baseline kind without adding another flag.

On `start`, an omitted value resolves to `draft` when the policy's draft section is enabled and to `none` when it is disabled. The second case preserves the existing draft-disabled apply review: it already runs without a draft record, and recording it as `draft` would misstate what the review checked. On `resume`, an omitted value means the recorded baseline; an explicit different value is refused.

An explicit `none` is refused when a draft record already exists. Such a change has a draft baseline and the apply review's plan-drift and plan-change-waiver checks; allowing `none` there would skip the user-approval gate for a plan change. An explicit `draft` is refused when the policy disables the draft section, because the record would otherwise claim a draft baseline that was never checked.

Rejected: making the draft optional whenever its record is missing. That would let a local caller bypass the draft gate with no signal in the call or the record.

Rejected: a global setting that disables draft review. It would change every change in the profile, not one review.

### The no-draft branch is local to the apply entry

When the resolved baseline is `none`, the apply entry skips the draft-record, intent, plan-drift and plan-change-waiver block as one unit, but only after refusing a change that already has a draft record. An explicit `baseline: "none"` requires an explicit non-empty `base`; a draft-disabled policy that omits `baseline` resolves to `none` but keeps the existing merge-base fallback, so that legacy path is unchanged. It still requires a clean tree, a commit, `--strict` validation and the apply lock. The base source remains `explicit` when a base is passed, so the existing brief line and base-tree diff need no new source kind.

The alternative of creating a synthetic draft record would give the apply review a draft lifecycle it never had: the record would need an intent, an artifact hash and a readiness state, and archive would later read a draft that no human reviewed.

### The record and the projection carry the baseline

The apply record gains `baseline: "draft" | "none"`. `projectReview` projects it, `status` and `report` return it, and the output schema declares it. Old records without the field are read as `draft`; no record migration is needed because the field only describes the current review.

The brief gains a baseline header line. With `none`, it omits the intent lines and the plan-drift and waiver sections, and it states that the committed tree and the change artifacts are reviewed as one object. The report format and the readiness rules do not change.

### Ignore check before the write

`ensureReviewIgnored` keeps its signature compatible by accepting an optional directory, defaulting to `<projectRoot>/openspec/.review`. In a git project it computes the worktree-relative path and runs `git check-ignore -q`:

- exit 0: the directory is already ignored; return without writing.
- exit 1: no rule covers it; keep writing the nested line.
- any other status: a failed check; keep writing, because skipping the line would risk an unignored record.

A non-git project keeps writing, as before. `assertReviewIgnored` passes the actual review directory; `ensurePolicy` and the non-git apply-lock path pass their directory too. This preserves the current behavior when no repository-level rule exists and removes the untracked file when one does.

Rejected: relying only on the root `.gitignore` change. It would still leave a write whenever the reviewed branch lacks the root rule, and the plugin would still create a file that its own clean-tree check counts as dirty.

Rejected: moving the review root into the git directory. It removes the worktree interaction entirely but changes the record layout, the documentation, the client card reader and the store-backed path — too large for this behavior.

## Risks / Trade-offs

- A caller can run an apply review without a draft review by passing `baseline: "none"` on a change with no draft record. Mitigation: the parameter is explicit, a draft record refuses it, the default is unchanged, the record states the baseline, and the repository workflow only uses it for a reviewed branch worktree. The tool does not claim that a no-draft review replaces the draft gate.
- The draft-disabled path now records `baseline: "none"`. Mitigation: the apply record and status state the baseline that was actually checked, and the existing draft-disabled behavior is preserved rather than relabeled.
- A repository-level ignore can hide a missing nested ignore line. Mitigation: the nested file remains the project-level contract; the check only skips the write, and `assertReviewIgnored` still verifies that git ignores the record directory.
- `git check-ignore` runs once per policy creation or non-git lock creation. Mitigation: it is a single bounded subprocess; no per-round cost.
- Old records have no `baseline` field. Mitigation: read it as `draft`; this is the only behavior those records ever had.

## Migration Plan

No stored data migration. New apply records carry the baseline; old records read as `draft`. Projects with an existing `openspec/.gitignore` keep it. Rollback is a revert: no record written by this change is committed, and the review directory remains ignored.

## Open Questions

None.
