# Fast-forward land

## Why

`openspec_apply_worktree action=land` currently creates a merge commit with `git merge --no-ff`, so every landed change adds a merge commit to `main`. The repository's GitHub ruleset requires a linear main history, and the previous landed push was reported as a bypass. Land must advance main to the reviewed feature head instead of merging it.

## What Changes

- Replace the `--no-ff` merge with `git merge --ff-only`; a successful land creates no merge commit and records `landCommit` equal to the feature head.
- Refuse a feature history that contains merge commits in `mainHead..featureHead`, and require a linear rebase first.
- Re-read `main` after taking the lifecycle and fresh change locks. A main that moved since the precheck is refused, records the rebase marker when apply review is enabled, and restores `status: active` while keeping the fresh change lock and token for the retry.
- Never reset or rewind main after a failed fast-forward or tree check. A concurrent seal commit that moves main after the recheck makes the fast-forward fail safely; it is preserved for the rebase and retry.
- Verify the feature head tree equals the required reviewed tree before the fast-forward, then verify the resulting main tree after it.
- Write new landed manifests as `<common>/openspec-flow/landed/<landCommit>.json` with `landCommit` and `landMode: "fast-forward"`. Readers fall back to legacy `mergeCommit` manifests.
- Resume a partly completed land by recognizing either the fast-forwarded `landCommit`, its archive commit, or a legacy merge and archive pair. A retry must not fast-forward or archive twice.
- Keep the legacy merge manifests readable by `land` cleanup and `remove`, and by `scripts/push-landed.mjs`.
- Teach `push-landed` to select and verify by `landCommit`, add `--land`, keep `--merge` as a legacy alias, and accept manifests that carry only `mergeCommit`.
- Update the land and push documentation, the flow policy, the shipped apply and archive skills, `docs/review.md`, `AGENTS.md`, `README.md`, tests and the tool result schema.

**BREAKING**: new manifests no longer write `mergeCommit`, and a worktree whose history contains a merge commit can no longer land until it is rebased into a linear history. Legacy manifests remain readable.

## Capabilities

### New Capabilities

None. This changes the existing land and landed-push behavior.

### Modified Capabilities

- `apply-worktree`: land preconditions, lock-scoped main recheck, fast-forward and tree checks, resumable land state, landed manifest fields and legacy manifest reading.
- `development-workflow`: the landed commit sequence and the `push-landed` selection, manifest validation, commit verification and documentation.
- `tool-surface`: the `openspec_apply_worktree action=land` result and output schema report the landed commit.
- `flow-policy`: the registered flow rule describes land as a fast-forward, archive and commit sequence rather than a merge.

## Impact

- `lib/worktree/land.js`: land state machine, fast-forward, linearity check, recheck, recovery detection, manifest and cleanup results.
- `lib/tools/worktree.js`: land result schema.
- `lib/policy.js` and `test/policy.test.mjs`: the agent-facing land wording.
- `scripts/push-landed.mjs`: manifest selection and verification.
- `skills/openspec-apply-change/SKILL.md` and `skills/openspec-archive-change/SKILL.md`: shipped land descriptions.
- `test/worktree-land.test.mjs`, `test/push-landed.test.mjs`, `test/worktree-inspect.test.mjs`, `test/descriptions.test.mjs`, `test/land-push-doc.test.mjs`, `test/apply-worktree-doc.test.mjs`: behavior, documentation and schema coverage.
- `docs/apply-worktree.md`, `docs/land-push.md`, `docs/review.md`, `AGENTS.md`, `README.md`: land and push language.
- `openspec/specs/apply-worktree/spec.md`, `openspec/specs/development-workflow/spec.md`, `openspec/specs/tool-surface/spec.md`, `openspec/specs/flow-policy/spec.md` after archive.
- No dependency, schema-version or configuration change. The seal does not acquire the lifecycle lock; the fast-forward remains the race-safe boundary.
- Existing merge commits already on main are not rewritten. The change affects new land operations only.
