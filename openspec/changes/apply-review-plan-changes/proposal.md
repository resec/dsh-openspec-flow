# Proposal: apply-review-plan-changes

## Why

A plan change during apply forces a fresh draft review: the apply review entry compares the change artifacts with the draft record and refuses a mismatch, so the draft reviewer is woken again after apply started. The same mismatch also means the plan and the implementation share one commit, so the apply review diff has no stable plan base. Today no auditable user waiver exists for a plan change made during apply.

## What Changes

- **BREAKING** In a git repository, the first `openspec_apply_next` requires a seal commit: a clean working tree, a `HEAD` that changes at least one file under `openspec/changes/<name>/` and no file outside it except `openspec/.gitignore`, and change artifacts that still match the draft record hash. It records that commit as the apply base. A project without git keeps the current behavior.
- The draft review can be resumed while apply has not started; once apply started it cannot be resumed. A plan change during apply is reviewed by apply review, not by a new draft round.
- Apply review start and resume no longer refuse when the change artifacts differ from the draft. They record the drift and list the changed artifacts in the brief.
- **BREAKING** During apply, a plan change requires a user waiver recorded through `openspec_review action=waive scope=plan-change files=[...]`; an artifact change outside the recorded file set is refused.
- The apply brief gains a plan-change section and plan axes (plan coherence, intent fit, scope control), plus the intent path.
- Draft readiness and status ignore artifact drift once apply started; `openspec_apply_next` re-sync is not refused by a stale draft hash.
- The apply skill, flow policy, and review document describe the seal, the waiver, and the draft freeze.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `change-review`: add the seal requirement and the plan-change waiver requirement; update draft readiness, apply base, apply review drift, and resume rules.
- `tool-surface`: update the apply gate, the `openspec_review` waive parameters, and the next-action naming for a started apply.
- `skill-adaptation`: update the apply skill so it seals the draft, commits each round, and records a plan-change waiver.
- `flow-policy`: update the draft and apply gate text.
- `review-documentation`: update the review document content requirement.

## Impact

- `lib/tools/review.js`, `lib/review/readiness.js`, `lib/review/object.js`, `lib/review/store.js`, `lib/review/brief.js`
- `skills/openspec-apply-change/SKILL.md`, `AGENTS.md`, `docs/review.md`, `lib/policy.js`
- Tests: `test/review-draft.test.mjs`, `test/review-apply.test.mjs`, `test/review-unit.test.mjs`, `test/policy.test.mjs`, `test/review-doc.test.mjs`, `test/skill.test.mjs`
- `README.md` documents the seal, the draft freeze and the waiver.
- A change that already started apply keeps its recorded base and is not re-sealed; the seal applies to the first `apply_next` of a change without a recorded base.
