# apply-worktree delta

## MODIFIED Requirements

### Requirement: Apply worktree creation uses a state key and safe branch

The plugin SHALL create an apply worktree for a git project at `<mainRoot>/.cache/openspec-flow/worktrees/<stateKey>` from the recorded seal commit, where `stateKey` is `<store>#<change>` with `local#<change>` when no store is selected. The branch SHALL be `openspec/apply/<slug>-<hash>` where `slug` replaces every character outside `[A-Za-z0-9_-]` with `-` and `hash` is the first 8 hex characters of the state key's SHA-256.

#### Scenario: A git change creates one worktree

- **WHEN** `openspec_apply_next` starts a git change whose draft is ready and sealed
- **THEN** it creates the worktree from the seal commit on the branch the seal created

#### Scenario: The drafted change is visible

- **WHEN** the worktree is created from the seal commit
- **THEN** `openspec/changes/<change>/` is present without copying uncommitted files

#### Scenario: A change name with a double dot gets a safe branch

- **WHEN** the change is named `release..1`
- **THEN** the dot becomes `-` and `git worktree add` succeeds

#### Scenario: A key starting with a dot gets a safe branch

- **WHEN** a store id starts with `.` so the state key starts with `.`
- **THEN** the slug starts with `-` and the branch is valid

#### Scenario: A non-git project keeps the single-tree apply

- **WHEN** the project has no git repository
- **THEN** `openspec_apply_next` proceeds without creating a worktree

#### Scenario: An existing state reuses its worktree

- **WHEN** the state is active and names a clean worktree on the expected branch
- **THEN** `openspec_apply_next` reuses it and moves the session to that worktree

## ADDED Requirements

### Requirement: The seal creates the apply branch before the worktree

The seal stage SHALL create or reset the apply branch to the new seal commit when no worktree uses it, reuse the branch only when its tip equals the seal commit, and refuse with a recovery action when a worktree is attached. A failed creation SHALL keep the branch and the ref.

#### Scenario: The branch exists before the worktree

- **WHEN** the first apply seals a git worktree change
- **THEN** the apply branch points at the seal commit before the worktree exists

#### Scenario: A branch left by a removed checkout is reset

- **WHEN** a previous abandoned checkout left the branch behind and a fresh draft seals again
- **THEN** the branch is reset to the new seal commit

#### Scenario: An attached worktree refuses

- **WHEN** a worktree already uses the apply branch
- **THEN** the seal refuses and names the recovery action

#### Scenario: A failed creation keeps the seal

- **WHEN** worktree creation fails after the seal commit exists
- **THEN** the apply branch and the seal ref remain
- **AND** a later call reuses them without constructing a second seal

### Requirement: The seal ref uses the branch-safe name

The plugin SHALL create `refs/openspec-flow/seal/<slug>-<hash>` with the same slug and hash as the apply branch, never the raw state key, and SHALL delete it when land completes, when `openspec_apply_worktree action=remove` deletes an archived or explicitly abandoned checkout, and when an abandoned change is removed. A missing ref SHALL be tolerated. The ref SHALL NOT advance main, appear in `git branch`, or enter a normal push.

#### Scenario: The ref is created with the seal

- **WHEN** the first apply seals a git worktree change
- **THEN** `refs/openspec-flow/seal/<slug>-<hash>` points at the seal commit and main's `HEAD` is unchanged

#### Scenario: A double dot is safe in the ref

- **WHEN** the change is named `release..1`
- **THEN** the ref name uses the computed slug `release--1` and the seal succeeds

#### Scenario: A leading dot is safe in the ref

- **WHEN** a store id starts with `.` so the slug starts with `-`
- **THEN** the ref name is valid and the seal succeeds

#### Scenario: Land deletes the ref

- **WHEN** land completes the merge, archive and manifest
- **THEN** the seal ref no longer exists

#### Scenario: Remove deletes the ref

- **WHEN** `openspec_apply_worktree action=remove` deletes an archived or abandoned checkout
- **THEN** the seal ref no longer exists and a missing ref does not fail the call

### Requirement: Land reconciles the planning copy with the seal tree

Land SHALL reconcile the planning copy with the seal tree before its clean-main check and fast-forward: matching untracked files under the change directory and the plugin-written root `.gitignore` are removed, and a tracked root `.gitignore` that is modified or deleted is restored to its `HEAD` version so the fast-forward can update it.

#### Scenario: The matching copy is removed and the fast-forward proceeds

- **WHEN** the untracked files under the change directory match the seal tree and the other land checks pass
- **THEN** land removes them, the clean-main check passes and main fast-forwards

#### Scenario: The uncommitted ignore file is removed

- **WHEN** the plugin-written root `.gitignore` is untracked and matches the seal tree
- **THEN** land removes the working copy and the clean-main check passes

#### Scenario: A tracked ignore file is restored

- **WHEN** the root `.gitignore` is tracked and modified or deleted in main
- **THEN** land restores its `HEAD` version and the fast-forward updates it

#### Scenario: A failing check restores the removed copy

- **WHEN** land removed the untracked copy and a later check fails before main is updated
- **THEN** the removed files exist again as untracked files and the tracked ignore file keeps its pre-land bytes

### Requirement: Land refuses a planning copy that differs from the seal

A planning-copy file that differs from the seal tree or is not in it SHALL make land refuse and list the paths. Land SHALL NOT change any other tracked file.

#### Scenario: A modified copy refuses land

- **WHEN** an untracked file under the change directory or the plugin-written `.gitignore` differs from the seal tree or is not in it
- **THEN** land refuses and lists the differing paths without changing anything

#### Scenario: Other tracked files are left alone

- **WHEN** the change directory has files tracked by main and unmodified
- **THEN** land does not change them and the fast-forward updates them

#### Scenario: A tracked modified planning file refuses

- **WHEN** a file under the change directory is tracked by main and modified in the working tree
- **THEN** land refuses and names the path

### Requirement: Land restores the pre-land copy only when it touched it

A failure before main is updated SHALL restore the pre-land working copy, including removed untracked files and a restored tracked ignore file. A copy absent before land SHALL stay absent, and a copy already superseded by the merge SHALL NOT be restored.

#### Scenario: An absent copy is not recreated

- **WHEN** the untracked change directory or an untracked ignore file is already absent from main before land
- **THEN** land proceeds without recreating it

#### Scenario: A merged copy is not restored

- **WHEN** main already contains the change directory from the branch after a completed fast-forward
- **THEN** a retry does not restore the pre-land copy
