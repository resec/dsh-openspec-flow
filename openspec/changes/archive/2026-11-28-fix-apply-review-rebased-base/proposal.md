# Proposal

## Why

An apply review diffs two trees from the seal commit recorded at the first `openspec_apply_next`. When the branch is later rebased or merged onto a newer main, that seal is no longer the branch point, so every main commit the branch took in appears in the review diff as if this change made it. A round then reports main's landed behavior as undeclared scope, and the change must waive a finding that describes another change's code.

## What Changes

- Re-base a draft-baseline diff origin: when the seal commit's parent is an ancestor of the current fork (`git merge-base HEAD origin/main`) but not the fork, the base tree SHALL become the fork tree overlaid with the paths the seal changed, the base source SHALL be `rebase`, and the original seal commit SHALL be recorded as `rebasedFrom`.
- Keep the seal commit as the diff origin when main advanced without entering the branch, when `origin/main` cannot be resolved, or when the round received an explicit `base`.
- Re-base an automatic no-draft base: when its recorded source is `merge-base` and the recorded base is an ancestor of the current fork, the base becomes the fork tree with the original base in `rebasedFrom`; an `explicit` recorded base, or one that is not an ancestor of the fork, stays authoritative and the caller moves it by passing `base` again.
- Name the re-based base, its source and the original base in the apply review brief.
- Refuse the round with an instruction to pass `base` when the overlay tree cannot be built; never review against a silently degraded diff.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `change-review`: the apply review re-bases its diff origin after main enters the branch, records the rebase source and the original base, and names both in the brief.

## Impact

- Changed code: `lib/review/base.js` (new resolver), `lib/worktree/seal.js` (seal-path overlay tree), `lib/tools/review.js` (base resolution wiring), `lib/review/brief.js` (base source text). Every tree entry resolves its base through the same block, so an apply round and a `pr` round follow the same rule.
- Changed tests: `test/review-base.test.mjs` (new), `test/review-apply.test.mjs`, `test/review-reviewer.test.mjs`, and `test/review-doc.test.mjs` when the documentation test enumerates the base sources.
- Changed documentation: `docs/review.md`, `AGENTS.md`.
- No dependency, configuration, schema-version or `dist/` change; review records keep their shape and gain two optional fields.
