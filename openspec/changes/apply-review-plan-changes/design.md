# Design: apply-review-plan-changes

## Context

See `proposal.md` for the motivation. The current code paths that this design touches:

- `lib/tools/review.js`: `applyReviewEntry` (start/resume), `startReview`/`resumeDraftReview`, `reviewStatus`, `projectReview`, `assertDraftReviewReady`.
- `lib/review/readiness.js`: `draftReadiness`, which treats an artifact hash mismatch as not ready.
- `lib/review/brief.js`: `buildApplyBrief`, which forbids re-reviewing a plan change.
- `lib/review/store.js`: git helpers; `lib/review/object.js`: draft object and file hashes.

A draft record has no commit field, so a draft review is not anchored to a commit. The apply base is whatever `HEAD` was when `apply_next` first ran. The draft record's `artifactFiles` already store each artifact path and sha256, so plan drift can be computed without a new record format.

## Goals / Non-Goals

**Goals**

- Anchor the draft review to a seal commit that contains the change directory and the plugin's ignore file in git projects.
- Freeze the draft review once apply started; make apply review the only reviewer of plan changes during apply.
- Make a plan change during apply require an auditable user waiver.
- Keep the draft record format unchanged.

**Non-Goals**

- Changing the draft review object or its no-git exemption.
- Changing the non-git apply path.
- Changing the apply review's clean-tree or strict-validation rules.

## Decisions

### D1: Seal checks run inside `assertDraftReviewReady`

`assertDraftReviewReady` already runs once per `apply_next` call and already records `applyBaseCommit`. The seal check runs there when all of these hold: the draft policy is enabled, the project is a git repository, and `record.applyBaseCommit` is undefined.

Checks, in order:

1. `gitStatus(rootPath).trim() !== ''` — refuse with a message that names the commit or stash action.
2. `gitCommitPaths(rootPath, 'HEAD')` — every path must be under `path.relative(rootPath, context.changeRoot)` with a trailing separator, or be `openspec/.gitignore`, which the plugin itself writes when it creates the review root. At least one path must be under the change directory. Refuse and list offending paths.
3. `draftObject(changeRoot, intent).artifactHash !== record.artifactHash` — refuse and name resume draft review or restoring the reviewed version.
4. Record `applyBaseCommit = gitCommit(rootPath)`.

`gitCommitPaths` is new in `lib/review/store.js`. It runs `git diff-tree --no-commit-id --name-only -r <rev>^1 <rev>` and falls back to `git diff-tree --root --no-commit-id --name-only -r <rev>` when the rev has no parent (the initial commit). A merge commit is compared with its first parent. An empty change set fails check 2: the seal commit must change at least one file under the change directory, so a no-op commit and a `.gitignore`-only commit cannot seal.

Why not compare `HEAD` with a stored base: the draft record has no base before this change, and a worktree-only comparison would accept a mixed commit. Why not require the whole tree to consist of change files: the repository has earlier commits; only the seal commit must be pure.

### D2: "Apply started" is derived, not stored

A helper returns true when `record.applyBaseCommit !== undefined` or an apply review record exists. Both conditions are durable facts already written by the plugin: the first `apply_next` writes the base, and an apply review start writes its record. No new flag is added to the draft record.

### D3: Readiness ignores stale only after apply started

`draftReadiness(record, currentObjectHash, kind, options)` gains `options.ignoreStale`. With it, the mismatch reason is not produced and it does not trigger a resume action. `assertDraftReviewReady` passes it when apply started, so a re-sync after a plan change is not refused. `reviewStatus` for the draft passes it under the same condition and points its next action at the apply review instead of `resume review=draft`.

The draft record keeps the hash of the reviewed artifacts. The apply record's drift is the audit of later changes. Adding a `superseded` flag was rejected: the same fact is derivable from the apply record, and a stored flag would need its own lifecycle.

### D4: Drift is computed from recorded artifact files

`diffArtifactFiles(before, after)` compares two `{path, sha256}` arrays and returns `[{path, status}]` with `modified`, `added` or `removed`. `applyReviewEntry` computes it on every start and resume when the draft policy is enabled and the hashes differ, and stores `draftDrift: { draftObjectHash, currentObjectHash, files }` on the apply record. The brief lists the drift under `## Plan changes since the draft` and adds three axes: plan coherence, intent fit and scope control. The intent path and hash are added so the reviewer can read the goal without searching. The rule that forbade re-reviewing a plan change is removed.

If a legacy draft record has no `artifactFiles`, the drift is recorded with an empty `files` list and the brief states that the file list is unavailable; the waiver whitelist check is skipped for that record rather than failing every round. When a waiver exists, the brief includes its text, approver, time and file list under `## Plan change waiver`.

### D5: Plan-change waiver is a waive branch

`openspec_review` with `action: "waive"` and `args.scope === "plan-change"` takes a separate branch from the finding waiver. It requires that apply started (the draft record's `applyBaseCommit` is set or an apply review record exists), `approvedBy: "user"`, a non-empty `waiver`, and an explicit `files` array. The files are required because the waiver is recorded before the edit, when no drift exists yet; a fallback to the current drift would record an empty set. It writes `plan-change-waiver.json` in the review directory with `{ text, approvedBy, files, recordedAt, draftObjectHash, currentObjectHash }`. Repeated calls union the file sets and keep the latest text and time.

`applyReviewEntry` reads the waiver file and refuses a start or resume when a drift file is outside the file set, naming the unwaived files. The waiver is checked before the round is opened, so a round cannot record a review of an unwaived plan.

Why a separate file: the apply record is created by the apply review start, and the start is refused while an unwaived drift exists, so a waiver stored on the apply record could never be written. The draft record stays unchanged per the design goal, so the waiver gets its own file in the review directory.

Why enforce in the entry: the user requires approval before the edit, and a soft warning would let an unwaived plan reach a passing review. Why a separate field instead of a finding waiver: the approval precedes the finding, and a finding waiver cannot represent a pre-approved file set.

### D6: Draft resume freeze

`resumeDraftReview` refuses when apply started, before opening a round. The error names the apply review and the plan-change waiver. A draft review that passed before apply can still be resumed for a plan change; only the started apply freezes it.

## Risks / Trade-offs

- Seal checks could reject an initial commit that legitimately contains the project — [Mitigation] the error names the mixed paths; the author commits the change directory in a separate commit.
- Clean-tree requirement could block a worktree with unrelated work — [Mitigation] the message names commit or stash; the seal is checked only once per change.
- Apply reviewer may rubber-stamp a plan change — [Mitigation] plan axes ask for concrete evidence, intent is provided, and the waiver white list limits scope.
- Waiver whitelist could block an urgent fix — [Mitigation] repeated waivers merge file sets; the error names the missing files.
- Legacy records without `artifactFiles` — [Mitigation] drift is recorded as unavailable and the whitelist check is skipped for them.

## Migration Plan

- No record migration. New behavior applies on the next `apply_next` of an active change.
- A change that already started apply keeps its recorded base and is not re-sealed; the seal applies only to the first `apply_next` of a change without a recorded base.
- Rollback is reverting the commit; the `draftDrift` field and `plan-change-waiver.json` are ignored by older code.

## Residual Limits

- A store-backed change directory may live outside the project root; the seal path comparison cannot match it, so the seal check is skipped for such a change and a warning is recorded. The seal applies to project-local changes only.
- `assertDraftReviewReady` records the apply base before the apply state is read. A failure after that point leaves the draft frozen and the base recorded; recovery is to continue apply or remove the review records.
- The gate currently reads `settings.reviews.draft.enabled` before the locked policy. An edit that disables the setting after the policy was locked skips the seal; the locked policy remains the authority for the review behavior itself.

## Open Questions

None.
