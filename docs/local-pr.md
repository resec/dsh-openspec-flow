# Local pull-request completion

This is the maintainer path for turning a reviewed plugin apply worktree into a merged pull request and an archived change. It is repository tooling, not a plugin feature: no plugin runtime, review record or tool surface changes.

The path has two branches:

- Online: publish a pull request, wait for green CI, merge with `gh pr merge --rebase`, retarget the reviewed worktree to the merge commit and finish with the existing `openspec_apply_worktree action=land`.
- Offline: when GitHub is unreachable, skip the pull request, run the local lab, land locally, archive and stop at local `main`. The push is deferred until GitHub returns.

The local state, not a pull-request label or body marker, decides that a pull request is owner-managed. The scheduled review watch skips it completely.

## Local owner state

`scripts/pr-publish.mjs` writes one entry per local pull request to `<main worktree>/.cache/pr-review/local-prs.json`, resolved against the main worktree rather than the process working directory, so a command run from the plugin worktree and the scheduled watch read the same file.

```json
{
  "schemaVersion": 1,
  "prs": {
    "21": {
      "number": 21,
      "change": "add-dark-mode",
      "branch": "openspec/apply/local-add-dark-mode-12345678",
      "head": "<published head sha>",
      "tree": "<reviewed tree sha>",
      "record": "local#add-dark-mode",
      "ownerSession": "maintainer-session",
      "phase": "published"
    }
  }
}
```

The phases are `published`, `merged`, `retargeted`, `landed`, `pushed`, `landed-offline` and `failed`. `state --cleanup` deletes an entry only when its pull request is closed without a landing or its phase is `pushed`; any other phase is retained and reported, including `landed` and `landed-offline`. A corrupt local state refuses the watch run instead of hiding a local pull request.

## Landing lock

The cross-session landing lock lives at `<main worktree>/.cache/pr-review/landing.lock/` and records the owner session id, a random token, the pull-request number and the acquisition time.

```sh
# Inspect the owner, age and staleness. Reads only.
node scripts/pr-review-lock.mjs status
node scripts/pr-review-lock.mjs status --json

# Acquire after publication and before the final landing work.
node scripts/pr-review-lock.mjs acquire --session <id> --pr <n>

# Release as the recorded owner.
node scripts/pr-review-lock.mjs release --session <id> --token <token>

# Explicit operator release of a stale lock. The status command never clears it.
node scripts/pr-review-lock.mjs force-release --reason "<why the owner is gone>"
```

`--owner-session` is accepted as an alias for `--session` in the lock command. The same owner session re-enters its existing lock: `acquire` with the same session returns the recorded owner even without the earlier token, so a scheduled run that crashed after acquiring resumes instead of waiting for the lock to go stale. Another session is still refused. A local owner holds the lock through the rebase, re-review and CI of a new head and through merge, retarget, land, archive and push. A repeated publish accepts the owner's own lock with the recorded token and refuses another session. The landing commands treat the recorded owner session as the primary ownership check: they may omit `--token`, and a token that is supplied must match the recorded one. A stale lock is reported with its owner and age (the documented limit is 120 minutes) and is released only by `force-release`.

Contributor landing commands (`plan`, `sync`, `prepare`, `reviewed`, `merge`, `archive`, `push`, `finish`) refuse while a local owner holds the lock. Review commands remain available, so the watch may still review a contributor pull request.

A contributor landing run takes the same lock. Before its first landing command the scheduled session runs `node scripts/pr-review-lock.mjs acquire --owner-session <scheduled-session> --pr <n> --json` and keeps the token, then passes `--session <scheduled-session>` to each `pr-review-land.mjs` landing command. `finish` releases the lock; a run that stops after a sync, a prepare or a sync-refusal releases it with `release --session <scheduled-session> --token <token>`. When `preflight` reports a stale lock, the operator force-releases it before acquiring again; a non-stale lock held by another session stops contributor landing.

## Preflight

`scripts/pr-review-watch.mjs preflight` is read-only. It reports GitHub reachability, whether local `main` leads `origin/main`, unfinished landing phases and the landing-lock owner:

```sh
node scripts/pr-review-watch.mjs preflight
node scripts/pr-review-watch.mjs preflight --json
```

The JSON result carries `online`, `reason`, `offlineLand`, `command`, `localMain` (`main`, `originMain`, `ahead`, `behind`), `lock` and `landings`. When GitHub authentication or the API check fails, the result routes to `offline-land` and prints the offline command. When local `main` leads `origin/main`, the reason is `local-main-ahead` and `node scripts/push-landed.mjs --push` is the required step.

## Publishing a local pull request

Run from the plugin worktree. The default is a dry run; only `--apply` writes.

```sh
node scripts/pr-publish.mjs --session <id>
node scripts/pr-publish.mjs --session <id> --apply
```

`--change` selects the change when the worktree apply state is ambiguous; `--token` is required for a repeated publication whose landing lock is already held. `npm run pr:publish -- --session <id>` is the same entrypoint.

The gates run before anything is pushed:

1. The current directory is an active plugin apply worktree for the change.
2. The worktree is clean.
3. The apply review is passed and its `treeSha` equals the worktree head tree.
4. The main planning copy still matches the seal.
5. Local `main` does not lead `origin/main`; otherwise the command refuses and names `scripts/push-landed.mjs --push`.
6. GitHub is reachable; otherwise the command reports `offline-land` and writes nothing.
7. No unfinished contributor landing exists.
8. The landing lock is free, held by the same session with the supplied token, or absent.

With `--apply` the command pushes the reviewed branch, creates the pull request as a draft, writes the local owner entry, marks the pull request ready and acquires the landing lock. It writes no `mergeable` and no `owner-review` label and publishes no review comment. The pull-request body carries an audit marker:

```text
<!-- local-apply-review: change=<change> tree=<tree> review=<record> session=<session> -->
```

A repeated run with an open pull request updates the entry and marks the pull request ready without creating a second one. A closed or merged pull request is refused and is not reopened. A failure after the entry is written records the `failed` phase.

### Maintainer restricted-path exemption

Pull-request CI runs `scripts/check-pr-change.mjs`. Its external-contribution rules reject a pull request that touches `.githooks/`, `.github/workflows/`, `dist/`, `openspec/changes/archive/`, `coverage.baseline.json` or `package-lock.json`. A maintainer pull request that must carry such a change, such as this tooling change that edits `.githooks/pre-push`, would never reach green CI under the unchanged gate.

The workflow passes `--maintainer` only when the pull-request author is `resec` and `github.event.pull_request.head.repo.full_name` equals `github.repository`, so a fork or another author cannot claim the exemption. The flag skips only the restricted-path refusal. The check still requires exactly one active change, no unchecked tasks, a readable head `package.json`, and no dependency, engine or package-manager field change. Every external pull request still fails on a restricted path, and no label or local state grants the exemption automatically.

## Online completion

After the apply review passes and the pull request has green CI:

1. Confirm the head contains the current `origin/main` and merge:

   ```sh
   gh pr merge <n> --rebase
   ```

   A local pull request needs no `mergeable` label and no trusted pass comment; the passed apply review and the CI rollup are the gates.

2. Verify the merge and the reviewed tree without writing:

   ```sh
   node scripts/pr-local-land.mjs verify <n> --session <id>
   ```

   It requires the pull request to be `MERGED`, `origin/main` to be the merge commit, the merge commit tree to equal the reviewed tree, the plugin worktree to be clean and on the apply branch, and local `main` to be an ancestor of the merge commit.

3. Reset the reviewed worktree branch to the merge commit:

   ```sh
   node scripts/pr-local-land.mjs retarget <n> --session <id> --apply
   ```

   It records `merged` and then `retargeted`, and the worktree tree still equals the reviewed tree. `--token` is optional when `--session` matches the recorded lock owner.

4. Land with the plugin, on the user's explicit approval:

   ```text
   openspec_apply_worktree action=land change=<change> approvedBy=user
   ```

   Land fast-forwards `main` to the merge commit, archives the change, commits the archive, writes the landed manifest and removes the worktree and branch.

5. Push only the archive commit and record the phase:

   ```sh
   node scripts/push-landed.mjs --push
   node scripts/pr-local-land.mjs finish <n> --phase pushed --session <id> --apply
   ```

   Because the land commit is already on `origin/main`, only the archive commit is in the pushed range. `finish --phase pushed` verifies the landed manifest, that local `main` is the archive commit and that `origin/main` equals it, records `pushed` and releases the landing lock. `--token` is optional when `--session` matches the recorded lock owner.

### A head behind main

When the head does not contain `origin/main`, the owner rebases the plugin worktree, runs `npm run verify`, resumes the apply review in the same session (`openspec_review action=resume review=apply`), and pushes the new head by re-running the publish command with its `--token`. The pull request is reused, the local entry's head and tree are updated and the owner holds the landing lock through the new head's CI. Merge only after the new CI rollup is green.

If the merge commit tree differs from the reviewed tree, `verify` refuses and the change is not archived. Re-review the merged tree or redo the landing; never retarget or land a mismatched tree.

## Recovery

The unattended watch reports a merged local pull request whose entry is not `landed`/`landed-offline`/`pushed`; it never reviews, retargets, lands or merges it. A user-approved recovery session reads the recorded owner session and plans the remaining steps with:

```sh
node scripts/pr-local-land.mjs recover <n>
```

The plan verifies the merge and tree and lists, in order:

1. `openspec_apply_worktree action=recover scope=change expectedOwner=<token>` when the plugin change lock is held by a dead process. A corrupt lock is reported for inspection first.
2. `node scripts/pr-local-land.mjs retarget <n> --session <session> --apply`; when the landing lock is still held, the plan appends the recorded `--token`, and a lock owned by another session must be force-released first
3. `openspec_apply_worktree action=land change=<change> approvedBy=user`
4. `node scripts/push-landed.mjs --push`
5. `node scripts/pr-local-land.mjs finish <n> --phase pushed --session <session> --apply`

`status` reports the entry, pull-request state, worktree, change-lock state and landed manifest without writing.

## Offline completion

When `preflight` or `pr-publish` reports `offline-land`, no branch, pull request or local state is written. After the apply review passes:

1. Run the local lab because no remote CI runs before the deferred push:

   ```sh
   npm run test:lab -- --mock-only
   ```

2. Land and archive locally with the user's approval:

   ```text
   openspec_apply_worktree action=land change=<change> approvedBy=user
   ```

3. Record the offline phase and stop at local `main`; do not push:

   ```sh
   node scripts/pr-local-land.mjs finish <n> --phase landed-offline --session <id> --apply
   ```

When GitHub returns, `node scripts/push-landed.mjs --push` publishes the deferred land and archive commits, and `node scripts/pr-local-land.mjs finish <n> --phase pushed --session <id> --apply` records `pushed`. Until that push completes, local `main` leads `origin/main`, which blocks a new online pull request and contributor landing; both refuse and name `push-landed`.

A published but unmerged local pull request may fall back to the offline land because its worktree still exists: land the same reviewed worktree locally, record `landed-offline`, and leave the open pull request for reconciliation. If its head is in the deferred commits, the later push closes it as merged; otherwise close it manually.

## State and reports

```text
.cache/pr-review/
  local-prs.json             local owner entries (resolved against the main worktree)
  landing.lock/owner.json    cross-session landing lock owner
```

The phase recorded by `finish` is the operator's record of the completion. The landed manifest under `<git common dir>/openspec-flow/landed/` remains the push authority; see [land-push.md](land-push.md).
