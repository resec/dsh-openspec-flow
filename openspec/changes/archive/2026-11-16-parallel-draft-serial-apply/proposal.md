# Proposal: parallel draft reviews, serial apply

## Why

The plugin scopes review records by change, but two of its gates assume one active change. The seal commit must change nothing outside the change directory, so a project that already committed another change's artifacts refuses the first apply. Apply itself has no project-level mutex, so two changes can enter apply and mutate `HEAD` for each other, invalidating the apply review tree. Parallel planning of several changes is a normal workflow; parallel implementation is not.

## What Changes

- A draft review remains change-scoped: multiple changes can start, resume and report their own draft reviews at the same time, without one blocking another.
- Apply locks make the apply-to-archive segment serial. Every change locks its implementation domain (the session's git worktree, the nearest OpenSpec root, or the change's resolved root); a store-backed change also locks its store domain, so one store change is serial across projects. A git domain keeps its lock in the worktree git directory, so nested roots share it and the worktree stays clean; another domain uses `openspec/.review/`.
- The first change that calls an apply entry acquires its implementation lock by review key `<store>#<change>` and, for a store change, a store lock that also records the implementation root; another identity's `openspec_apply_next`, apply review start or resume, and archive are refused while a lock names it, including the same store change from a second project.
- Draft review stays available while the lock is held: only apply entry points are refused.
- The seal, apply review and archive clean-tree checks ignore uncommitted files under other `openspec/changes/**` directories, so a parallel draft's edits cannot deadlock the holding change. A path under the sealed change or outside `openspec/changes/` still counts as dirty.
- The locks are released after a successful archive of the change. A failed archive keeps them. A lock whose recorded change directory or implementation root no longer exists is stale and can be taken over. Only the user may remove the lock files to release a paused change, on request; the agent must ask.
- The seal commit check accepts other `openspec/changes/**` paths in `HEAD`; the clean tree and the reviewed artifact hash are still required, and the seal commit stages the reviewed change directory plus the plugin-written `openspec/.gitignore` when present. The apply review tree binding is unchanged because serialization keeps other changes out of `HEAD` until the lock releases.
- Documentation, the shipped skills, and the flow rule state the serial apply boundary and the concurrent draft behavior.
- **BREAKING**: none for a project that applies one change at a time. A project that already has a second apply-started change must archive it first or remove the lock files once.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `change-review`: seal-commit paths, concurrent draft reviews, the project-level serial apply lock, and the dirty-tree exception.
- `tool-surface`: apply and archive preconditions when another change holds the apply lock.
- `flow-policy`: the standing rule states cross-change serialization and concurrent draft reviews.
- `review-documentation`: the review document covers the lock, its record, and the concurrency contract.

## Impact

- New module: `lib/review/apply-lock.js` for the lock domains, the `<store>#<change>` identity plus the store lock's implementation root, the field list, reading, acquiring, releasing and taking over the locks.
- Modified: `lib/tools/review.js` (draft gate, apply review entry), `lib/tools/apply.js` (apply entry), `lib/tools/write.js` (archive check and release), `lib/review/store.js` (dirty-tree filtering), `lib/policy.js`, `skills/`, `README.md`, `docs/review.md`, `AGENTS.md`.
- Lock files live in each git domain's worktree git directory and under `openspec/.review/` otherwise; `ensureReviewIgnored` runs only for the non-git location. No new dependency and no CLI change.
- The seal path comparison switches to worktree-relative paths so a nested OpenSpec root can seal its own directory and ignore file.
- Tests: concurrent draft reviews across two changes, lock refusal and release, identity across stores, a store change and a local change in one project, two store changes from different stores, a store change used from two projects, nested-root and linked-worktree behavior, stale takeover, manual release, non-git serialization, archive refusal, the relaxed seal commit, and the dirty-tree exception.
