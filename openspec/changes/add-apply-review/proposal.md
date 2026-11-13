# Add apply review

## Why

Draft review checks the plan, but nothing checks that the applied commit matches that plan before the change is archived. Archive currently merges delta specs and moves the change after only structural validation, so a mismatch between the reviewed plan and the implementation can reach the main specs without review.

## What Changes

- Extend `openspec_review` with `review: "apply"`: start, status, self-report, report, dispose, waive, extend and abandon.
- Make the apply review object the committed git tree. Require a git repository, a clean working tree and a commit before start.
- Bind the apply review to the draft review's artifact hash and the recorded `applyBaseCommit`.
- Gate `openspec_archive` on a ready apply review; in a project without git, disable apply review and skip its gate.
- Add apply-review config (`enabled`, `reviewers: 0`, `maxRounds: 5`, `waitMinutes: 15`) and lock it per change.
- Extend the flow rule and the apply/archive skills with the apply review step.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `change-review`: add the apply review object, git and commit preconditions, artifact-hash binding, report and readiness, and the archive gate.
- `tool-surface`: add apply-review actions to `openspec_review` and gate `openspec_archive`.
- `flow-policy`: the scoped rule states the apply review gate and the tree object.
- `skill-adaptation`: the apply and archive skills run the apply review before archive.

## Impact

- `lib/tools/review.js`: apply-review start, tree hashing, dirty-tree refusal, report storage and readiness.
- `lib/tools/apply.js`: persist the apply base commit; apply review starts from it.
- `lib/tools/write.js`: gate `openspec_archive`.
- `index.js`: apply-review config and tool registration.
- `lib/policy.js`, `skills/openspec-apply-change/SKILL.md`, `skills/openspec-archive-change/SKILL.md`: workflow text.
- `README.md`: tool, configuration and gate notes.
- Tests: apply review flow, non-git refusal, dirty tree refusal and archive gate.
- No new dependency and no CLI change.
