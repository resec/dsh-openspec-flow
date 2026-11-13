# Design: apply review

## Context

See `proposal.md` — Why. Draft review already stores the artifact hash, the report lifecycle and the finding/readiness contract. This change reuses those contracts for a second review whose object is the committed git tree.

## Goals

- Bind apply review to a clean commit and its tree, never a working-tree snapshot.
- Reuse the draft artifact hash so the implementation is reviewed against the plan that passed.
- Gate archive on a ready apply review without adding a second review tool.
- Disable apply review cleanly when the project has no git or the policy turns it off.

## Non-Goals

- Independent reviewer subagents and the reviewer preset.
- Changing the draft object or the self-review path.
- Configuration-page work.
- A merge/rebase review; the object is one committed tree and the base recorded at apply start.

## Decisions

### Apply object is `HEAD^{tree}`

`start` resolves `HEAD`, records `commitSha` and `treeSha = HEAD^{tree}`, and recomputes the tree hash on every status, report and gate. A dirty working tree is refused, because the review would otherwise name bytes that are not in the tree.

Alternative: hash the working tree directly. It would not be reproducible from the commit and would let an unreviewed edit slip between review and archive.

### Draft artifact hash binds the plan to the implementation

The apply start reads `HEAD`'s change artifacts and computes the same `changeHash` as draft review. It compares that with the draft record's `objectHash`. A mismatch refuses the start and asks for a fresh draft review. This prevents reviewing an implementation whose plan changed after draft approval.

### Apply base comes from `openspec_apply_next`

`openspec_apply_next` already records `applyBaseCommit` in the draft record when the review is ready and the project has git. Apply review uses that commit as its base tree. If no base is recorded (for example a legacy change or a disabled draft review), it falls back to `git merge-base HEAD origin/main`; an explicit `base` argument overrides both and is recorded.

### Reports and readiness are reused, not duplicated

The apply review stores `review: "apply"`, `objectKind: "tree"`, its own rounds and findings in the same `review.json`. It uses the same report validator, finding disposition and readiness calculation. Only the object hash and the preconditions differ.

### Archive gate runs before any read

`openspec_archive` checks the apply review before listing changes or validating. A refusal therefore leaves the change and the working tree untouched. The gate reads the policy, record, intent and tree; a policy without apply review, or a project without git, returns without a check.

### Non-git is a closed state

The policy records `git.enabled: false`; apply review start refuses. The archive gate skips. This is a deliberate reduction from draft review, which remains available without git.

## Risks and trade-offs

- **Dirty tree refusal** → the user must commit before every apply round; the error names the commit step.
- **Base mismatch** → if `applyBaseCommit` points at the wrong commit, the review diff is wrong; the start records and validates the base and a mismatch with the draft tree is reported.
- **Tree hash recomputation on each action** → extra git calls, but they are local and bounded.
- **A plan change after draft** → the artifact hash check fails; the user must re-run draft review, which is the intended gate.

## Migration Plan

1. Existing changes without apply-review policy keep working: archive skips the gate.
2. The first apply review start writes `reviews.apply` into the policy if it is missing, using current settings.
3. Disabling apply review or using a project without git leaves archive unchanged.
4. Rollback removes the apply branch and the archive gate; records stay inert.

## Open Questions

None. The reviewer-subagent and configuration-page decisions are staged after this change.
