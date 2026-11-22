# Proposal: Draft execution preflight

## Why

Apply reviews in the past week repeatedly found plans whose verification claims could not be executed: tasks naming test files that do not exist and were never written, or naming files the change does not use. Correcting them during apply needs a written plan change and a user waiver. The draft review already blocks a plan whose requirement descriptions would fail the archive merge, but it does not check whether the plan's execution references resolve.

Two mechanical gaps remain. A MODIFIED or REMOVED requirement may name a main-spec header that is absent: change validation skips a missing MODIFIED baseline, and the merge fails only at archive. A task may name a `test/` or `scripts/` file that is absent and that the change never creates, so the verification cannot run as written.

The requirement-length gate is the precedent. Moving that mechanical check into draft review removed the apply-time plan changes it used to cause. This change adds the same kind of draft-time check for execution references.

## What Changes

- Add an execution preflight to draft review `start` and `resume`:
  - Every MODIFIED or REMOVED requirement name, and every RENAMED `from`, SHALL resolve in the current main spec. Pending renames SHALL be followed. A missing main spec blocks a delta that anchors to it. A missing baseline that another unarchived change supplies is cleared by waiting for that change to archive and resuming the draft review, not by editing this change; the refusal names both routes.
  - Every repo-relative `test/` or `scripts/` path named in a backticked code span in `tasks.md` SHALL exist at the project root, or the task clause that names it SHALL declare creating, deleting, renaming or moving it. Globs, placeholders, absolute paths and `..` segments are skipped.
- Record the result as an additive `execution` field on the draft review record, render an `## Execution preflight` section in the draft brief, and keep the draft review not ready while the result blocks.
- A block with no finding is cleared by draft `resume`, not `dispose`; the resume needs an artifact edit unless the missing baseline is supplied by another unarchived change, which needs that change to archive first.
- Recheck the preflight at the first apply entry before apply starts and at apply review `start` or `resume`. A blocking result refuses the entry or round, so a plan change made during apply is covered too.
- Document the gate in `docs/review.md` and `README.md`, and update the propose skill's no-finding block branch to name the execution preflight alongside the requirement-length gate.
- No new dependency, no new tool, no CLI change and no state schema change. `proposal.md` Impact and `tasks.md` file-list agreement, `design.md` path scanning and automatic artifact fixes are out of scope.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `change-review`: the draft review runs an execution preflight, records it, gates readiness on it, and rechecks it at the apply entry and the apply review entry.
- `review-documentation`: the review document and README state the execution preflight and the action that clears it.
- `skill-adaptation`: the propose skill resumes a preflight-only block without a dispose call.
- `tool-surface`: the next action for an execution-preflight-only block names draft `resume`, not `dispose`.

## Impact

- New `lib/review/preflight.js` and `lib/review/requirements.js`.
- `lib/review/length.js`: import the moved requirement resolver; behavior unchanged.
- `lib/tools/review.js`: load the delta, main-spec and task inputs once for both gates; record the result, render the brief, and recheck at the apply entry and apply review entry.
- `lib/review/readiness.js`, `lib/review/brief.js`.
- `docs/review.md`, `README.md`, `skills/openspec-propose/SKILL.md`.
- Tests: new `test/review-preflight.test.mjs`; additions to `test/review-draft.test.mjs`, `test/review-apply.test.mjs`, `test/review-unit.test.mjs`, `test/review-doc.test.mjs` and `test/skills.test.mjs`.
