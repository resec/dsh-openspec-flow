# Design: parallel draft reviews, serial apply

## Context

See `proposal.md` for the motivation. The current review store already keys every record by `<store>#<change>` under `openspec/.review/`, so draft records can coexist. The two gates that assume a single active change are the seal commit path check in `sealDraft` and the absence of any project-level apply arbitration. The apply review binds the full `HEAD^{tree}` and `openspec_archive` requires that tree to remain exact, which is why the serial segment must extend through archive rather than end at apply review readiness.

## Goals / Non-Goals

- Goals: draft reviews of different changes run side by side; one change owns apply and archive at a time in every tree the change uses; the serial segment ends only after a successful archive; the seal commit accepts other change directories while still proving the reviewed artifacts are what got sealed; a parallel draft's uncommitted files cannot deadlock the holder; the locks never dirty the tree or create a fake OpenSpec project.
- Non-Goals: parallel apply of two changes that share an implementation or store domain, per-file partial apply review, and any change to the draft review object or the apply review object hash.

## Decisions

### Decision: two lock domains: implementation and store

Every change acquires the lock of its implementation domain, the worktree whose code and commits apply produces: the session's git worktree root when there is one, else the nearest OpenSpec root at or above the session working directory, else the change's resolved root.

A store-backed change also acquires the lock of its store domain, because its apply review binds the store's tree and its review record lives in the store. The store lock serializes one store change across projects; the implementation lock serializes that change against local changes and other store changes in the same worktree. Skipping the implementation lock would let a store change commit into a project worktree while a local change holds that worktree's tree, which is exactly the failure this change exists to prevent.

Acquisition is ordered: implementation domain first, then the store domain, and a failure releases every lock acquired by the same call. The fixed order prevents two store changes from different stores deadlocking on each other's store locks.

### Decision: the location within a domain

A git domain stores its lock at `<git dir>/openspec-flow/apply.lock.json`, where the git directory comes from `git -C <domain> rev-parse --git-dir` normalized to an absolute path. Using the worktree's git directory rather than the common directory keeps linked worktrees independent, because each linked worktree has its own `HEAD` and its own git directory. A non-git domain stores its lock at `<domain>/openspec/.review/apply.lock.json`; that path already sits under an OpenSpec directory, so no project-shaped directory appears.

This location keeps the lock out of `git status`, creates no fake OpenSpec project at a worktree root, and makes every OpenSpec root inside one worktree resolve to the same git directory.

Alternative considered: a worktree-root `openspec/.review/` lock. It forces `ensureReviewIgnored` to create `<worktree>/openspec/.gitignore`, leaves an untracked entry the plugin's own clean-tree check refuses, and makes `isOpenSpecProject` report the worktree root. Rejected.

Alternative considered: a single store-domain lock for a store-backed change. Rejected because the implementation commits happen in the session worktree, not the store, so the local change's tree would remain unprotected.

Alternative considered: a lock directory created with `mkdir` and no JSON record. It is atomic but cannot report which change holds the lock, which is the information the refusal and the stale-takeover path need. The JSON file plus the existing short mutex keeps both properties.

### Decision: the lock identity is the review key plus the implementation root

The implementation-domain lock compares the recorded `store` and `change` as `<store>#<change>`, the same key the review store uses. The store-domain lock also compares the recorded `implementationRoot`, because one store change can be applied from several projects: a second project is a different identity and is refused, while the same project re-entering apply is allowed. A name-only comparison would treat `local#foo` and `team#foo` as the same change, and a review-key-only store lock would let a second project take the same-change re-entry path.

Each record carries `schemaVersion`, `change`, `store`, `changeRoot`, `implementationRoot` and `startedAt`. The module exports `LOCK_FIELDS` so the documentation test reads the field names from one source. Every read-modify-write runs inside the existing `withReviewLock` directory mutex on the lock directory, so two callers cannot both decide a lock is free and both write it. Records are read outside the mutex for status projection and diagnostics.

### Decision: acquire the locks before the seal, release fresh locks on seal failure

`assertDraftReviewReady` computes readiness first, then calls `acquireApplyLocks`, then runs `sealDraft`. Readiness comes first so an unready change reports its review problem instead of a lock conflict. The order matters because the seal writes `applyBaseCommit` into the record; if a lock is refused, the record must stay untouched. When `sealDraft` throws and the locks were created by this call, the code releases them before rethrowing, so a failed seal does not block the project. Pre-existing locks owned by the same review key are kept.

Alternative considered: acquire the locks inside `sealDraft`. Rejected because `sealDraft` also serves the apply-base path where the locks may already exist, and mixing the two concerns hides the rollback point.

### Decision: enforce the locks in every apply entry, release them in archive only

`openspec_apply_next` acquires the locks after the draft gate, including when the draft review is disabled or the change has no policy, so serialization does not depend on the draft switch. Apply review `start` and `resume` acquire the same locks, which covers legacy changes whose apply began before this feature. `openspec_archive` does not acquire locks; it refuses when any present lock names another identity, proceeds when none does (including when only one of the two locks is present), and releases every lock that names its change after a successful archive. A failed archive keeps them.

Alternative considered: acquire the locks on the first `openspec_archive` call. Rejected because apply already started long before archive, and acquiring at archive time would let two changes run apply concurrently.

### Decision: one worktree-relative path base for the checks

`git status --porcelain` reports paths relative to the repository root; `git diff-tree --name-only` reports repository-relative paths as well. The seal, apply review and archive checks therefore compare worktree-relative paths throughout.

The dirty-tree filter drops status entries whose path falls under an `openspec/changes/` directory and is not under the reviewed change's own worktree-relative directory. Everything else, including a path outside an `openspec/changes/` directory, still refuses. The seal allowlist builds its change prefix from the change directory relative to the worktree, and permits the change's OpenSpec root `.gitignore` relative to the worktree. That makes a nested root's seal accept `packages/x/openspec/changes/<change>/...` and `packages/x/openspec/.gitignore`, which the old project-relative comparison refused.

This exception is carried by MODIFIED blocks for the main "Apply review object is the committed git tree" and "Git projects seal the draft before apply" requirements, not only by the new requirement, so the merged spec has no absolute clean-tree rule left. The flow rule states the same exception.

The seal commit is created by the user; the plugin cannot stop a `git add -A` from sweeping another change's files into it, but the artifact-hash check binds the sealed change and the other change's draft hash is unaffected by being committed. The flow rule and `docs/review.md` say to stage the reviewed change directory plus the plugin-written `openspec/.gitignore` when present.

### Decision: stale takeover, user-only manual release, and no lock on archive

`acquireApplyLocks` treats each lock as stale when its recorded `changeRoot` no longer exists on disk, or when its recorded `implementationRoot` no longer exists. This covers a change archived by an older plugin, a deleted change, a crashed process, and a store lock left by a deleted or relocated implementation project. The takeover rewrites the record under the lock mutex. A store-backed change records its own absolute `changeRoot`, so the same test works outside the project root. A lock with no `changeRoot` or no `implementationRoot` is also stale. A partially acquired set is released before a refused acquisition returns.

A paused change keeps its directory, so the stale rule does not fire. The supported release is the user deleting the lock files named in the refusal; the refusal includes their absolute paths, tells the agent to ask the user, and `docs/review.md` documents the step. The plugin never removes a live lock on its own, and the flow rule forbids the agent from removing it.

### Decision: no ignore file is needed for a lock in a git domain

Because a git domain keeps its lock in its git directory, no `.gitignore` entry and no review directory are created in the working tree. `ensureReviewIgnored` runs only for the non-git location, where it maintains the existing `.review/` entry under an OpenSpec root.

### Decision: no new serialization for draft review

Draft review writes are already per-change and guarded by `withReviewLock` on the change's review directory. Reviewer activations are independent managed activations, and the `subagents` service accepts several active children per parent. The wait registry is keyed by review directory and kind. Concurrent draft starts can both call `ensureReviewIgnored` on the non-git path; the write is idempotent, so the design accepts a benign duplicate ignore write instead of adding a lock to the draft path.

## Risks / Trade-offs

- The git directory is not obvious to a user. Mitigation: the refusal names the absolute paths, and `docs/review.md` states the possible locations.
- A user can still commit while another change holds the locks; the plugin refuses entry points, not git. Mitigation: the flow rule, `docs/review.md`, and the lock refusal text say the commit is out of bounds; the archive tree check still rejects a moved tree.
- A leftover lock blocks changes until it is removed. Mitigation: the stale check removes locks whose change root is gone; the refusal names the files and the holder; only the user removes them, and the document says so.
- Releasing the locks fails after a successful archive. Mitigation: log a warning; the next acquire sees the recorded change root is gone and takes over.
- A legacy in-progress change and a new change race for the locks after upgrade. Mitigation: both acquire the same locks, so one wins deterministically; the loser names the winner, and archiving the winner releases them.
- A seal commit can sweep another change's artifacts into `HEAD`. Mitigation: the flow rule and the document say to stage the reviewed change directory and the plugin ignore file only; the other change's draft hash still matches because its tracked bytes are unchanged.
- The git directory may be read-only in an unusual sandbox. Mitigation: the acquisition fails closed with an actionable error; no fallback to a second location, because two locks against one tree would break the review binding.
- Two linked worktrees of one repository run independent serial segments. This is intentional: they bind different `HEAD` trees. A user who wants cross-worktree serialization applies one worktree at a time.
- A store change's apply review binds the store tree while its implementation commits move the project worktree's tree. Mitigation: the store change holds both locks, so no local change can move that worktree during the store change's apply segment.
- The store lock also records the implementation root, so the same store change applied from a second project is refused until the first archives. Mitigation: intended; the refusal names the holding project's implementation root.
- Relocating a project, worktree or store makes a live lock's `changeRoot` look stale and allows takeover. Mitigation: the takeover is only a safety valve; a moved project re-acquires on the next apply entry.

## Migration Plan

- Upgrade is additive: existing records and policies are read unchanged. The first apply entry after the upgrade acquires the locks; no record migration is required.
- Rollback is the user removing the lock files named by the refusal and reverting the code; review records are untouched.
- Verification: the new regression tests cover concurrent draft reviews, lock refusal and release, identity across stores, a store change applied from two projects, a store change and a local change in one project, two store changes from different stores, a vanished implementation project making its store lock stale, nested-root and linked-worktree behavior, a clean worktree after acquisition, stale takeover, manual release of both locks, non-git serialization, the dirty-tree exception including nested roots, the nested-root seal, seal acceptance of another change directory, and archive release of both locks including the one-lock-present case.

## Open Questions

None. The lock lifetime is settled as apply start through successful archive, including when apply review is disabled, unavailable or the policy is missing.
