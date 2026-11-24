# Design

## Context

See [proposal.md](proposal.md) - Why. `push-landed` already fetches `origin/main` and requires a fast-forward, but it never compares the manifest's land commit with the remote main. The repository's pull-request route lives in scripts and documentation; the plugin policy is generic content and must not learn this repository's route. The enforcement therefore belongs to the repository's push boundary.

The pre-push hook already distinguishes a main-only push from another or mixed push and runs `openspec:check:push` before the coverage decision. It has the remote and local commit ids from Git and does not fetch.

## Goals / Non-Goals

**Goals**

- Refuse a main push whose range contains a landed worktree commit that is not already on the remote main.
- Allow online PR merges, contributor landings, local PR retargets, recorded offline deferred pushes and non-worktree pushes.
- Keep the rule independent of the plugin policy and of an agent reading `AGENTS.md`.

**Non-Goals**

- No plugin policy or runtime change, no pre-land hook, no automatic recovery of a direct land after the worktree has been removed.
- No behavioral change to `pr-publish`, retarget or contributor landing; only the three local-main-ahead refusal messages gain the `--offline` hint.
- No change to archive ordering.
- No gate for the documented non-worktree direct push path.
- No rewrite of already-pushed history.

## Decisions

### Gate the manifest land commits in the range, not every commit

The manifest selected by `--change`/`--land`/latest is only one of the manifests that can be in `origin/main..HEAD`. The current script documents that the range can include earlier unpushed land commits. Checking only the selected land commit would let an earlier direct land ride along.

The guard builds maps from every readable manifest: `archiveCommit` to manifest and `landCommit`/`mergeCommit` to manifest. It classifies a manifest as present when its resolved land commit is in `base..tip` (reachable from the tip and not from the base) or its archive commit is in that range. A present manifest is allowed when its land commit is an ancestor of the base, or when offline is allowed and the change has a matching record or `landed-offline` phase. Plain reviewed commits in the range are not refused: a fast-forward land carries every reviewed commit before its tip, and only the tip is the manifest land commit. An earlier direct land still has its own manifest land commit in the range, so it is caught.

Alternative: require every range commit to be a manifest land or archive commit. Rejected because a multi-commit reviewed branch and a documented non-worktree commit are not manifest entries; it would block the offline route this change preserves.

### Share one guard module

`scripts/landed-push-guard.mjs` owns manifest reading, local-state/offline-record lookup and range classification. `push-landed` and `check-main-push` call it. The alternative, duplicating the rule in the two commands, risks the two boundaries drifting.

The guard takes `root`, `base`, `tip`, `allowOffline` and an optional `offlineMarker`. `push-landed` uses the fetched `origin/main`; the hook uses the `remote_sha` and `local_sha` Git supplied, so a stale remote-tracking ref cannot change the decision.

### Offline needs a record, not just a flag

A bare `--offline` would be a new unconditional bypass. The offline route also has no local owner entry when `pr-publish` reports `offline-land`: the command writes no branch, pull request or local state, while `pr-local-land finish <n>` requires an entry. The existing `landed-offline` phase only fits a published but unmerged pull request.

`scripts/offline-land.mjs` records a pre-publish offline land by `change` and `landCommit` after verifying the manifest, main HEAD, archive commit, tree and user approval. `push-landed --offline` accepts either that record or an existing `landed-offline` local phase. The record is keyed by the resolved land commit, so a stale record cannot authorize a different land.

Alternative: extend `pr-local-land finish` with a PR-less form. Rejected because the command is organized around a local owner entry and a PR number; a separate record keeps the two states distinct.

### Hook verifies, offline marker forces the sanctioned command

The hook applies the same range rule to the Git-supplied remote and local SHAs. The hook reads the `refs/heads/main` line inside its loop and captures that line's `local_sha` and `remote_sha` in dedicated variables; a mixed push therefore uses the main pair, not the last ref's pair, and passes both to `check-main-push` explicitly. Online archive pushes pass without an environment marker because their land commits are already on the remote. For an offline range the hook requires `DSH_PUSH_LANDED_OFFLINE=1`, set by `push-landed --offline` only after it verified the record or phase. A raw `git push` of an offline land is therefore refused; `push-landed` remains the one command that can publish the deferred route.

A range with no manifest-backed commit keeps the existing non-worktree path and is not refused by the new check. A direct worktree land always writes a manifest, so it is inside the gate.

### Keep the plugin policy generic

`lib/policy.js` remains unchanged. It cannot assume a project has an `AGENTS.md` completion section, and encoding this repository's `pr-publish` route there would leak a project-specific workflow into a general plugin. The repository enforces its own route in its own scripts.

## Risks / Trade-offs

- [A direct land is refused after `openspec_apply_worktree land` has removed the worktree] -> The push is blocked and `origin/main` is unchanged, but recovery is manual: follow the documented recovery that restores the feature branch or records the offline land after the lab. The gate protects the remote; it cannot undo the local land.
- [An offline record or `--offline` is abused to publish a direct land] -> The record requires `--apply`, the manifest, the reviewed tree and user approval; `--offline` alone does nothing. The local guard is not a security boundary and `--no-verify` remains an explicit bypass, as it is today.
- [A legitimate online land is refused because the merge commit is missing] -> `push-landed` fetches `origin/main` before deciding; a failed fetch is already a refusal. The hook uses the remote SHA supplied by Git.
- [The existing `push-landed` tests model a local fast-forward land] -> They must be changed to an online merge fixture; a new direct-land fixture covers the refusal. This is expected test churn, not a behavior regression.
- [A stale offline record authorizes a later land] -> Records are keyed by the resolved land commit and checked against the manifest's change, archive commit and tree.
- [A raw direct `git push` bypasses `push-landed`] -> The hook applies the same range rule. `--no-verify` remains an explicit operator override.

## Migration Plan

No state schema migration. Existing manifests and local owner entries keep their format; a legacy `mergeCommit` is resolved by the same fallback as today. After deployment:

- Online and contributor landings need no command change.
- The offline route gains `offline-land record` before stopping and `push-landed --push --offline` when GitHub returns; a published but unmerged pull request may keep `pr-local-land finish --phase landed-offline`.
- `AGENTS.md` and both push documents are deployed with the scripts, before the next offline push.
- Rollback is a revert of the change; no state is rewritten.

## Open Questions

None.
