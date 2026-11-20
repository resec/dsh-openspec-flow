# Design: Run apply in a worktree

## Context

See `proposal.md` — Why. `apply-worktree` provides the shared state, lifecycle/change locks and inspection. This change creates the worktree, moves the changer session there and routes the apply tools. Draft review and the seal stay in main.

## Goals / Non-Goals

Goals:

- One plugin-created worktree per applying change, shared through the state.
- The changer session, task marking, validate and apply review run in the worktree.
- Different changes apply concurrently through per-change locks.
- An existing clean branch/PR worktree can be reviewed without being modified.

Non-Goals:

- Land, archive-in-land, landed manifest, removal, push, dependency caches, DSH profiles or ports.
- Changing draft review, apply review reports or seal rules.

## Decisions

### State key and branch name

The state key is `reviewKey(store, change)`: `<store>#<change>`, or `local#<change>` without a store. The state file is `<common>/openspec-flow/apply/<stateKey>.json`. The worktree path is `<mainRoot>/.cache/openspec-flow/worktrees/<stateKey>`; `assertSafeSegment` already makes the key one filesystem component.

The branch is `openspec/apply/<slug>-<hash8>`, where `slug` is the key with every character outside `[A-Za-z0-9_-]` replaced by `-`, and `hash8` is the first eight hex characters of `sha256(stateKey)`. This keeps `release..1`, a leading dot and other accepted change names out of invalid refs while staying stable across main and linked worktrees. The state records the branch, not the slug rule.

### Ignore the worktree root without touching the repository

`git worktree add` refuses to create a checkout under a path that is inside a tracked directory only in the sense of the index; untracked `.cache` is not automatically ignored. The plugin checks `git check-ignore` for the worktree root. When it is not ignored, it appends the root to `<git common dir>/info/exclude` (a local, untracked file) before creating the worktree. It never writes a tracked `.gitignore` during apply, so the seal rule and the main tree stay unchanged.

### Creation is a lifecycle operation

`openspec_apply_next` resolves the ready draft and seal in main, then:

1. inspects the legacy project-wide apply lock and refuses a foreign holder;
2. acquires only the per-change change lock;
3. creates `git worktree add -b <branch> <path> <sealCommit>`;
4. moves the changer session to the worktree with `ctx.workingDirectory.set(agent, path, signal)`;
5. writes the state with `mainRoot`, `worktree`, `branch`, `baseCommit`, `sealedCommit`, `status: active`, `lockToken` and `lockPid`;
6. keeps the change lock.

`ctx.workingDirectory.set(agent, path, signal)` is present in the pinned `dsh-working-directory` package; this change adds it to `docs/upgrading-dsh-runtime.md` and `test/fake-context.mjs` and states its signature and failure behavior. If it fails or no agent is available, creation is rolled back: a state-write failure moves the session back to main, the worktree and the branch this call created are removed, any state is deleted and the change lock is released. A non-git project skips all of this.

A state that is `active` and names an existing clean worktree on the expected branch is reused by the apply owner for a resync; a `landing` state belongs to land and apply refuses it. A missing or different worktree is a repair signal and does not create a second checkout. Rollback deletes only the branch this call created, so a retry can recreate it.

### Per-change apply serialization

The existing project-wide implementation apply lock is inspected but not acquired for git worktree apply; a legacy holder blocks a new worktree apply. A store-backed change still acquires the store-domain project apply lock, so one store change cannot be applied from two projects. The persistent per-change change lock replaces it: it is acquired at apply start, kept across turns and handed to land with the state's `lockToken`/`lockPid`. Same-pid apply calls presenting the recorded token re-enter for a resync; a live foreign owner waits or is refused. When the recorded pid is dead and the lock is free, the caller acquires it and replaces the token/pid. Land owns the `landing` handover in its own change. A second change has a different lock file and proceeds.

After the review gate, `openspec_archive` from any cwd refuses a plugin-created state whose worktree is under `<mainRoot>/.cache/openspec-flow/worktrees/` and names `openspec_apply_worktree action=land` plus the deployment dependency; a user-created PR state keeps the existing archive path. Non-git projects keep the existing apply lock and main archive path.

### Route apply reads and writes

`openspec_apply_next` returns `worktree: { path, branch, base, mainRoot }` with `path` relative to `root.path` and keeps `root.path = mainRoot`. The apply cache still keys on `cwd + change + store`; the cached projection stores the CLI `changeDir` and `projectRoot`. After the session moves to the worktree, a second `apply_next`/`mark` reads the worktree-keyed entry; when the state changes worktree, the entry is evicted so a stale main `changeDir` is never reused.

`mark_task_done` resolves the state and runs against its worktree. `openspec_inspect` routes only `action: "validate"` and apply-state reads; `list`, `status`, `show`, `instructions` and `context` stay main reads. Draft review, intent and seal happen before creation and stay main.

### Existing branch/PR worktree

`openspec_review` apply `start`/`resume` accepts `worktree`. It validates same common dir, not main, clean tree and change present. It writes a state with `sealedCommit: null`, the explicit base and `status: active`, so `openspec_inspect action="worktree"` and a later remove can see it. It never creates, moves or deletes the checkout; a user-created worktree is distinguished from a plugin-created one by its path (plugin worktrees live under main `.cache/openspec-flow/worktrees`). The reviewer activation receives the worktree as its cwd; if the Host cannot set it, the start fails before a record is written.

### Deployment ordering

A worktree-applied change cannot be archived by `openspec_archive`; `openspec_apply_worktree action=land` owns that terminal step and is provided by `land-apply-worktree`. This change must not be installed without that change. The repository's own change can still be applied and archived with the currently installed plugin because the installed copy is frozen and this source is not installed until a new tarball is built.

## Risks / Trade-offs

- [Branch slug collision] → the 8-hex hash of the state key is appended; a collision is practically impossible and the state records the full key.
- [Session move fails after worktree creation] → remove the worktree and release locks; no state is written.
- [A stale state names a removed worktree] → report repair; do not create a second checkout.
- [Archive is unavailable until land ships] → document the deployment dependency; `openspec_archive` names `openspec_apply_worktree action=land`.
- [A state change does not evict the apply cache] → key the projection on cwd and explicitly evict the old worktree entry after the state write.
- [Reviewer cwd is not honored] → fail apply review start instead of reviewing main.
- [Per-change lock persists after a crash] → recover the dead lock, then acquire it and replace the state token/pid.

## Migration Plan

1. Deploy with `land-apply-worktree`; do not install this change alone.
2. Existing changes with no state keep the current main apply until their first worktree start.
3. Rollback: remove creation/routing; existing worktrees and states remain inspectable. Apply falls back to main; remove plugin checkouts manually. `openspec_archive` for the old path remains.

## Open Questions

None.
