# Gate an unmerged landed push

## Why

`push-landed` currently checks only that `origin/main` is an ancestor of `HEAD`. A worktree change that was landed directly, without a pull request, therefore still passes: its local land commit is not on `origin/main`, but the pre-land main is, so the fast-forward check accepts the push. The 23:23 `mergeable-first-landing` landing went through exactly this path and put 11 commits on `origin/main`. The plugin policy is generic plugin content and cannot be the enforcement point for this repository's pull-request route; the repository needs a push-boundary gate that does not depend on an agent reading a project document.

## What Changes

- **BREAKING**: `push-landed` refuses a push whose range contains a landed worktree commit that is not already on `origin/main`, unless the change has a recorded offline land and the caller passes `--offline`. The check applies to the whole pushed range, not only the selected manifest, so an earlier unpushed direct land cannot ride along.
- Add an `--offline` mode that is accepted only with a matching `landed-offline` local phase or a recorded offline land; the flag alone never authorizes a push.
- Add `node scripts/offline-land.mjs` to record a pre-publish offline land by `change` and `landCommit`, because `pr-publish` writes no local state when it reports `offline-land` and `pr-local-land finish <n>` cannot run without a local owner entry. Keep accepting the existing `landed-offline` phase for a published but unmerged pull request.
- Add `scripts/check-main-push.mjs` and call it from the pre-push hook for a push that includes `refs/heads/main`. It applies the same range rule to a raw `git push`; direct land is refused, and a raw offline push is refused unless `push-landed --offline` marked the push.
- Update `AGENTS.md`, `docs/local-pr.md`, `docs/land-push.md`, `docs/pr-review.md`, the pre-push installer message and the offline command string. The `pr-review-pipeline` offline deferred-push wording changes to `push-landed --push --offline` so the main specs do not disagree. Non-worktree direct pushes keep their documented behavior; the gate applies to landed worktree manifests.
- Do not change `lib/policy.js`, the plugin runtime, the `pr-publish`/retarget/contributor landing behavior, or the archive ordering. Only three local-main-ahead refusal messages gain the `--offline` hint. Do not rewrite the already-merged `mergeable-first-landing` history.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `development-workflow`: the push gate, the pre-push range check, and the offline record/`--offline` requirements for landed pushes.
- `pr-review-pipeline`: the offline deferred-push command changes to `push-landed --push --offline` and the offline land records its state before stopping.

## Impact

- `scripts/push-landed.mjs`, new `scripts/landed-push-guard.mjs`, new `scripts/check-main-push.mjs`, new `scripts/offline-land.mjs`
- `.githooks/pre-push`, `scripts/install-hooks.mjs`, `scripts/pr-review-watch.mjs` (`OFFLINE_LAND_COMMAND`)
- `scripts/pr-publish.mjs`, `scripts/pr-review-land.mjs`, `scripts/pr-local-land.mjs` (local-main-ahead refusal text only)
- `AGENTS.md`, `docs/local-pr.md`, `docs/land-push.md`, `docs/pr-review.md`
- `openspec/specs/pr-review-pipeline/spec.md` (offline deferred-push wording)
- `test/push-landed.test.mjs`, new `test/landed-push-guard.test.mjs`, new `test/offline-land.test.mjs`, new `test/check-main-push.test.mjs`, new `test/offline-push-spec.test.mjs`, `test/hooks.test.mjs`, and the docs/spec/command-string tests
- No plugin policy, tool schema, dependency or data migration change
