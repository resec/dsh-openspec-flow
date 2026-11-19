# Design: Share review records across worktrees

## Context

See `proposal.md` — Why. Today `reviewRoot(projectRoot)` joins `openspec/.review` under the project root, and every record, card, policy and short write lock lives there. Apply worktrees will have their own project root, so the same change would get a different record in each worktree. The main worktree's archive would then not see the apply review written in the worktree. The record root must move to a location every worktree resolves identically.

## Goals / Non-Goals

Goals:

- One review record per change and per OpenSpec root across the main worktree, apply worktrees and PR worktrees of one git repository.
- Existing records and existing non-git projects keep working.
- No worktree ignore entry is needed for the shared root.
- Cards, policy listing and documentation follow the same root resolution.

Non-Goals:

- Creating apply worktrees, routing apply tools, land or archive changes.
- Moving anything else under `openspec/` or the git directory.
- Changing record, report, finding, readiness or short write-lock semantics.

## Decisions

### Resolve the shared root from the git common directory

For a git project, the primary root is:

```text
<git rev-parse --path-format=absolute --git-common-dir>/openspec-flow/review
```

For a directory outside git, or when the git command fails, the primary root is the legacy `<projectRoot>/openspec/.review`.

The common directory is used rather than the worktree root or the `.git` directory of the current worktree. A linked worktree's git directory is `.git/worktrees/<name>`, while its common directory is the shared `.git`; only the common directory names one store for the whole repository. `--path-format=absolute` avoids resolving a relative answer against the wrong process directory.

### Name records by the OpenSpec root

The git commands that resolve the common directory and the worktree root run in the change's `projectRoot`. The record name starts as `reviewKey(store, change)` (`<store>#<change>`, or `local#<change>`). For a git project whose `projectRoot` is not the worktree root, the resolver appends a stable suffix:

```text
@root-<first 12 hex of sha256(worktree-relative projectRoot)>
```

The top-level OpenSpec root keeps the unsuffixed name, so existing records and the common case stay readable. The suffix prevents two nested OpenSpec roots with the same change name from sharing one record. A project root outside any git worktree keeps the legacy root; the shared root applies only when the change's projectRoot resolves a worktree. The relative path is stable across linked worktrees, so both worktrees compute the same suffix.

### Keep the legacy root as a one-time copy source

`reviewDirectory(projectRoot, store, change)` returns the primary root's record directory. Before returning, it checks the migration marker:

1. If the primary record directory exists, use it.
2. If the primary is absent and the marker exists, return the primary path without copying. The user removed the shared record; the legacy copy must not restore it.
3. If both are absent and the legacy record exists, copy it once, write the marker, then publish the record.
4. If neither exists, return the primary path; the caller creates it as before.
5. Never delete or rewrite the legacy directory.

The marker is a small file at `<primaryRoot>/.migrated/<recordName>`. The copy is protected by the same per-record migration lock under `<primaryRoot>/.migrate/<recordName>.lock`; the copy itself is written to `<primaryRoot>/.migrate/<recordName>.tmp` and renamed into place. The copy excludes a `.lock` directory: a legacy short write lock is not part of the record and must not become a stale lock in the new location.

The marker is written before the record is published. If the copy or marker write fails, the temporary path is removed and the error names the legacy record and the lock path. If publishing fails after the marker is written, the marker is removed when possible; if that removal fails, the record is treated as migrated and the legacy copy is not restored, so a failed migration never resurrects a removed record.

### Keep reads and writes on one resolver

`reviewDirectory` remains the single record resolver, so every existing caller (`readReview`, `saveReview`, policy, cards, reviewer tool and readiness checks) uses the shared root without a second path rule. `reviewRoot` returns the primary root for callers that scan the store.

Settings policy listing scans the primary root, then legacy keys that have no primary record and no marker; each such key is resolved through `reviewDirectory`, which performs the copy before the policy is read. This keeps old locked policies visible while avoiding a full migration on plugin load.

The client card reader is a separate scan of the review root in `review/settings.js`. It scans the primary root first, then legacy keys without a marker. It does not copy or migrate the record during a read; it returns legacy cards until the record is migrated and still binds a returned legacy card to the turn. A marker suppresses legacy cards for a removed shared record, so a restart cannot show cards for a review the user deleted.

### Skip the ignore write for the shared root

`ensureReviewIgnored` and `assertReviewIgnored` keep their behavior for the legacy root. The resolver detects a shared record by resolving the review directory and the git common directory and comparing them; a path under the common directory returns before writing `openspec/.gitignore` or calling `git check-ignore`. The comparison uses resolved absolute paths, because the main worktree's `<root>/.git` is inside the worktree but its common directory may still be `.git`. The shared root is inside the git directory, which is not part of the worktree, so no ignore rule is needed and a `git check-ignore` failure must not block the record.

### Preserve the legacy ignore rules

The root `.gitignore` entry `openspec/.review/` and the tracked `openspec/.gitignore` entry `.review/` remain. They only serve the legacy root and non-git projects. The shared root is outside the worktree and needs no entry.

### Update the review test fixtures

`test/review-fixtures.mjs` computes a `reviewDir(root, change)` and writes policy files into it. Add one resolver helper that reads the current root from `reviewDirectory`/`reviewRoot` and update the fixture functions and the hard-coded `openspec/.review` assertions in the git-fixture review tests. Keep explicit legacy-path tests for the migration and ignore behavior.

## Risks / Trade-offs

- [Tests and fixtures hard-code `openspec/.review`] → one fixture helper resolves the current root; seven review test files are updated in the same batch.
- [Two worktrees copy the same legacy record concurrently] → per-record `mkdir` migration lock, temporary copy and rename; the loser waits for the published record.
- [A live legacy record is copied while another process writes it] → copy skips `.lock`; the legacy record remains the source of truth until the copy completes; a corrupted copy is never published.
- [A removed shared record is restored from the legacy copy] → the migration marker is checked before any copy and is written before the record is published.
- [Card reads write during a Host RPC] → the card reader never copies or migrates a record, but it still binds a returned legacy card to the turn and writes the delivery watermark under the existing card contract. Policy listing may copy every legacy record on the first listing, bounded by the number of legacy keys.
- [A transient git failure splits records across roots] → fail closed when a git project's common directory cannot be resolved but a repository is present? The current code treats a failed git command as non-git; this design keeps that fallback and reports the legacy path. The risk is documented rather than hidden: a policy and a record written in different git states can land in different roots.
- [Rollback to a version that reads only the legacy root] → the legacy copy is retained; new records stay in the git common directory and can be copied back manually, or the review can be re-run.

## Migration Plan

1. Deploy the change with the legacy root still present.
2. On the first access to a legacy change without a marker, copy its record once and write the marker.
3. Leave all legacy directories in place; do not commit or delete anything under `openspec/.review/`.
4. Rollback: the previous version reads the legacy root; no shared record is deleted. Shared records written after the upgrade are not visible to the old version; copy them back or re-run the review if they matter.

## Open Questions

None.
