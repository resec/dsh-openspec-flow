# Design: Sync behind same-repository pull-request branches

## Context

See `proposal.md` — Why. The landing loop currently has three states before merge: `plan` checks the gates, `prepare` fetches the head and rebases a local `pr-land/<n>` branch onto `origin/main`, and `reviewed`/`merge` continue on that local branch. `origin/main` is required by branch protection to be contained in the pull-request head, but the loop never updates the contributor's branch, so a behind branch fails at `gh pr merge`. `merge` also compares a possibly stale local `origin/main` because it does not fetch.

The watch and landing commands take the same `.cache/pr-review/run.lock`, so one command is active at a time. The trusted pass comment and the watch state are keyed by head; any head change requires a new independent review before the landing gates pass again. A synced head also triggers a fresh CI run, so the review can only start once the new rollup is green.

## Goals

- Update a same-repository branch that is behind `main` through GitHub's update-branch API, only when the `mergeable` label is present and the update is conflict-free.
- Leave fork branches untouched; report the author-update path instead.
- Require the latest `origin/main` before prepare and merge, and record a merge refusal in the landing state instead of leaving an open phase.
- Record `reviewed` and merge in the same scheduled run once the final review is ready; leave archive and push to a later run.
- Keep the existing trust model: the sync publishes no comment, and a new head is reviewed by the normal watch before it becomes a landing candidate again.

## Non-Goals

- Updating fork branches, force-pushing, rewriting commits, squashing, or creating a merge commit on `main`.
- Publishing a sync comment or changing `mergeable` or `owner-review`.
- Changing the plugin runtime, the review record format or the bundle.
- Shortening the review latency for a synced head; the new head must pass one independent review after its CI is green.

## Decisions

### Update-branch API instead of a local push

`sync` calls `PUT /repos/{owner}/{repo}/pulls/{n}/update-branch` with `expected_head_sha` set to the fetched head. GitHub performs the standard "Update branch" merge of the base into the head as the authenticated user and returns `202`. This gives a non-destructive merge commit on the pull-request branch, serializes with GitHub's own mergeability state, and avoids local push credentials and branch-protection surprises on the pull-request branch. A local `git merge` plus fast-forward push was the alternative; it duplicates GitHub's merge-queue behavior and would make the tool responsible for attributing a commit to a contributor's branch. A rebase plus force-push was rejected because it rewrites the author's commits and needs force.

### Detect "behind" from GitHub, verify with a fetch

`candidates` is read-only and reports `behind: true` when GitHub returns `mergeStateStatus: BEHIND`; it does not fetch. `sync`, `plan` and `prepare` re-fetch `origin/main` and the pull-request ref, then use `git merge-base --is-ancestor` to decide. `merge` fetches again. This keeps the read-only listing cheap and makes every mutating decision based on a fresh fetch.

### No local rebase in prepare

Because a behind same-repository head is synced before preparation and a behind fork head is refused for author update, `prepare` never rebases. It fetches, requires the head to contain `origin/main`, and creates the landing branch at the head. `plan` performs the same check before any write. Removing the rebase also removes the "Rebase conflict" landing state, which `abandon` already covers for a prepared phase.

### Conflict detection through the update call

`sync` refuses early when GitHub reports `CONFLICTING` or `DIRTY`, and otherwise calls update-branch. A `422` means a conflict or a stale head; the tool reports it and changes nothing. A local trial merge is unnecessary: the API refuses a conflict atomically, and the call includes `expected_head_sha`.

### Asynchronous completion polling

The update call is asynchronous (`202`). `sync` polls `gh pr view --json headRefOid` every second for up to 60 seconds, treating a head change as success. A timeout reports that the update was requested and leaves the branch unchanged; the next run re-reads the head and either sees the new head or retries. The command does not implement its own retry loop beyond the poll.

### State and invalidation

`sync` records `syncs[<n>] = { previousHead, newHead, at }` in `.cache/pr-review/landings.json` without creating a landing entry. It never writes watch state. The watch state therefore still names the old head; the next poll sees a new head with no published review and re-emits it as a new candidate once CI is green. `owner-review` is removed on the head change and is not re-added while `mergeable` is present, because the owner-review rules forbid adding it when `mergeable` exists; `mergeable` is unchanged. The landing gate's trusted-pass requirement then blocks landing until the new head is reviewed.

### Latest-main gates and failure records

`prepare` fetches `origin/main` before creating the landing branch and requires the head to contain it. It refuses otherwise: a same-repository head names the sync command, a fork head names the author-update action. This runs before the local landing branch exists, so a refusal leaves no landing entry.

`merge` fetches `origin/main` and the pull-request ref before comparing the pre-merge main, then requires `origin/main` to be an ancestor of the head. When main moved or the head is behind, it writes `phase: failed` with the reason before throwing, so the landing is no longer in an open phase; `candidates` can list it again and the next run can sync and review it. This replaces the previous check against a stale local `origin/main`, which let a protected branch fail after a successful prepare, and it closes the dead-end where a stale head left the landing in `reviewed`.

### Compressed final stage

The schedule prompt changes so that when the final apply review is ready — including the reviewer wakeup that follows a `wait` — the same run runs `reviewed` and then `merge`. No new command is needed: `reviewed` and `merge` already run under the same run lock and are idempotent. The next run still performs archive and push, because those steps touch `main` and the merged tree and remain a separate phase.

## Risks / Trade-offs

- **GitHub rebase-merge with a sync merge commit on the head** → The sync commit is a merge commit on the pull-request branch, not on `main`. Before enabling the schedule, validate on one scratch same-repository branch that `gh pr merge --rebase` produces a merged tree equal to the reviewed tree. If it does not, the fallback is a rebase plus `--force-with-lease`, which requires a new user decision.
- **Main moves between sync and the review/merge** → `merge` fetches and records `failed`; the next cycle syncs and reviews again. A main move also triggers a new CI run after the sync, so the review waits for green checks. The compressed final stage narrows the window but does not remove it.
- **Head changes during a watch review** → The old comment and watch entry belong to the old head; the new head is reviewed independently. No comment is deleted, and the sync records the head transition.
- **Fork branch behind** → `candidates` refuses it with an author-update reason; the session never calls `sync` for it, and `prepare` is not reached from the scheduled flow.
- **Update-branch permission** → The token has repository push/admin permission; a permission or branch-rule failure returns an error, recorded and retried by a later run without a partial update (the API is atomic).

## Migration Plan

1. Land the code, docs and specs; no plugin bundle or profile change is needed because these are repository scripts.
2. Run `node scripts/pr-review-land.mjs sync <n>` as a dry run against a behind same-repository pull request; confirm it reports the intended update.
3. Run `sync <n> --apply` once and verify the new head arrives, CI turns green, the watch re-reviews it, and the final merge succeeds.
4. Update the scheduled prompt to the new step ordering and the compressed final stage.
5. Rollback: revert the code and prompt; the `syncs` records are additive and harmless, and no branch was rewritten destructively (a merge commit remains on the pull-request branch, which a revert cannot undo but does not affect `main`).

## Open Questions

None that change the approach. The rebase-merge-with-sync-commit behavior is a validation step, not an open design question; if the validation fails, the fallback force-push variant requires a separate decision.
