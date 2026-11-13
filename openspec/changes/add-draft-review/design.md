# Design: draft review

## Context

The plugin currently has no review state. `openspec_new_change` creates the change, the propose skill writes artifacts, and `openspec_apply_next` starts implementation. The design adds the draft-review half of the approved review architecture while leaving the independent reviewer, apply review, reviewer preset and configuration page to later changes.

The draft object is deliberately not a git tree. It is the change artifacts plus the user's intent, so draft review works in projects without git and does not require a commit. Stage 0 confirmed that the bundled OpenSpec 1.16.1 validator ignores `openspec/.review/` when validating all specs.

## Goals

- Give each change one locked draft-review policy and one append-only review record.
- Let a changer self-review (`reviewers: 0`) through one tool surface.
- Make `openspec_apply_next` fail closed while an enabled draft review is not ready.
- Keep the record out of git through `openspec/.gitignore` and keep every mutation serialized.
- Preserve existing behavior for changes created before the policy exists.

## Non-Goals

- Independent reviewer subagents and the `openspec-reviewer` preset.
- Apply review, git-tree objects and archive gating.
- Configuration page and model selection UI.
- Multi-reviewer merging.
- Automatically editing artifacts or fixing findings.

## Decisions

### One review store under the OpenSpec root

Records live at `openspec/.review/<store>#<change>/`. The path is next to the change artifacts, survives `openspec_archive` because archive moves only `openspec/changes/<name>/`, and is ignored by the validator. `.review/` is added to `openspec/.gitignore`; the plugin verifies the record path with `git check-ignore` before writing.

Alternative: `.git/review/<change>/`. It is invisible to the working tree, but it fails in projects without git and makes the record harder to inspect. The chosen path serves both git and non-git projects with one layout.

### Policy is written before the change exists

`openspec_new_change` resolves the review settings and writes `policy.json` before invoking `openspec new change`. If the write fails, no change is created. If the change creation fails, the policy directory is removed. A legacy change gets its policy on its first `openspec_review start`.

The policy carries only review behavior: enabled, reviewers, maxRounds, waitMinutes and the draft model fields reserved for the later reviewer change. It does not carry `timeoutMs` or the global max reviewer limit.

### The draft object is an artifact hash

`changeHash` is computed over a sorted list of `path\0sha256(bytes)` for `proposal.md`, every `specs/**/*.md`, `design.md`, `tasks.md`, `.openspec.yaml`, plus the intent hash. The hash is recomputed on `status`, `self-report` and the apply gate. This makes an uncommitted artifact edit invalidate the review immediately.

The review record stores both the artifact paths and their individual hashes so a stale review can name what changed.

### Self-review is the only reviewer mode in this change

`reviewers` is normalized to `0`. The changer calls `self-report` with the same report shape the later independent reviewer will submit. This keeps the report, finding and readiness contracts in place before subagent execution is added. A `reviewers: 1` setting is refused by this change's config normalization; the later change enables it.

Alternative: implement the subagent reviewer now. It would add `startActivation`, preset composition, reviewer identity, wait/retry and tool visibility to a change that is already cross-cutting. The staged plan keeps that work separate.

### Reports are validated before they are stored

The report validator checks verdict, summary limits, finding shape, axes, severity, finding ids, critical/major evidence fields and verification shape. It rejects a second report for the same round. A report is stored with `revision`, `submittedAt`, `changeHash` and `promptSha256`; the prompt hash binds the brief the changer read.

### Readiness is computed, not self-reported

`ready` is derived from the latest report, finding dispositions, current artifact hash and policy switch. A `pass` verdict cannot introduce a critical or major finding. Every finding must be disposed or verified. This prevents a report from carrying a blocker while claiming `pass`.

### Apply gate records the base commit

`openspec_apply_next` checks the draft review before it loads apply state. When the review is ready and the project is a git repository, it records `HEAD` as `applyBaseCommit`; the later apply review will use that commit as its base. In a non-git project it records no base. A change without a policy is treated as legacy and is not gated until its first review start.

### One tool, explicit actions

`openspec_review` carries `action` values rather than separate tools. The first change registers `start`, `status`, `self-report`, `report`, `dispose`, `waive`, `extend` and `abandon`. Reviewer-only actions are added by the later reviewer change so the tool schema does not advertise unreachable behavior.

The tool is registered only when the resolved draft review is enabled. Tool descriptions must not name the OpenSpec CLI, matching the existing description scan.

### Review writes use a directory lock and rename

Every mutation creates `<review-dir>/.lock` with `mkdirSync`, re-reads the record under the lock, writes through a temporary file and renames it, then removes the lock. A holder reports the lock path instead of waiting. `status` is read-only and takes no lock.

## Risks and trade-offs

- **Uncommitted artifact review** → the apply gate rechecks the hash, so a later commit that drops an artifact is caught.
- **Self-review is weak** → it is the default (`reviewers: 0`) and is recorded as `independent: false`; the independent reviewer is a later change.
- **A record inside `openspec/` could be scanned by a future CLI** → the path is isolated in a dot directory and the stage 0 probe passed; a regression test asserts validation still ignores it.
- **A review report can still be wrong** → the validator enforces shape and verdict consistency, not semantic correctness. The later independent reviewer addresses this.
- **Non-git projects can self-review but cannot record an apply base** → apply review remains unavailable there, as approved.

## Migration Plan

1. Existing changes without a policy keep working: `openspec_apply_next` skips the gate until the first `openspec_review start`.
2. The first start writes the policy from current settings and creates the review directory.
3. The tool is registered only when the draft review is enabled; disabling it restores the old tool catalog.
4. Rollback removes the tool registration and the gate; existing review directories are inert and can be deleted.

## Open Questions

None for this change. The independent reviewer, apply review and configuration-page decisions are already recorded in the staged plan.
