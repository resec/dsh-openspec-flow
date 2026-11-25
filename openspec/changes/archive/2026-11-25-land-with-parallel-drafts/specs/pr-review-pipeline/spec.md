# pr-review-pipeline delta

## ADDED Requirements

### Requirement: Candidate worktree tolerance

`candidates` SHALL tolerate uncommitted paths under every `openspec/changes/` directory and SHALL report no blocked worktree for them. A path outside every such directory SHALL still report the blocked worktree once.

#### Scenario: Another change's planning directory

- **WHEN** the only uncommitted paths in the main worktree are under other changes' `openspec/changes/<name>/` directories
- **THEN** `candidates` lists the eligible pull requests and reports no blocked worktree

### Requirement: Landing worktree tolerance

`plan`, `prepare` and `merge` SHALL evaluate the main worktree against the landing change. An uncommitted path under another change's `openspec/changes/<name>/` directory SHALL be accepted. A path under the landing change's own directory, a path outside every `openspec/changes/` directory, a non-empty git index and a `HEAD` outside `main` SHALL be refused.

#### Scenario: Another change's planning directory is uncommitted

- **WHEN** the main worktree contains only uncommitted files under another change's `openspec/changes/<name>/` directory and the landing change's directory and the git index are clean
- **THEN** `plan`, `prepare` and `merge` proceed without refusing

#### Scenario: The landing change's own directory is uncommitted

- **WHEN** a path under the landing change's own `openspec/changes/<change>/` directory is uncommitted
- **THEN** the landing command refuses and names that path

#### Scenario: A path outside the changes tree is uncommitted

- **WHEN** a tracked file outside every `openspec/changes/` directory is modified, or an untracked path outside them exists
- **THEN** the landing command refuses and names that path

#### Scenario: The git index carries staged changes

- **WHEN** the git index contains one or more staged paths, even under another change's directory
- **THEN** `merge` refuses before calling `gh pr merge` and keeps the landing at `reviewed`

#### Scenario: HEAD is not on main

- **WHEN** the main worktree's `HEAD` is not the `main` branch
- **THEN** the landing command refuses before evaluating the pull request

### Requirement: Sync worktree independence

`sync` and `sync-batch` SHALL NOT require a clean main worktree. They SHALL keep the main-branch, landing-lock and local-`main`-ahead gates.

#### Scenario: A dirty main worktree does not refuse a sync

- **WHEN** a tracked file is modified or an untracked file exists in the main worktree and every sync eligibility gate passes
- **THEN** `sync` proceeds to update the branch

#### Scenario: A dirty main worktree does not stop a batch

- **WHEN** the main worktree is dirty and the batch has eligible behind branches
- **THEN** `sync-batch` evaluates and updates them instead of refusing the run

#### Scenario: A non-main branch still refuses

- **WHEN** the main worktree's `HEAD` is not the `main` branch
- **THEN** `sync` and `sync-batch` refuse without changing a branch

### Requirement: Archive worktree readiness

After `openspec_archive`, `archive <n> --apply` SHALL accept its own outputs: deletions under the source change directory, additions under the archived directory, the `openspec/specs` capability directories the archived change's delta names, plus another change's uncommitted planning directory. It SHALL refuse a staged git index, an untracked path under the source change directory, a spec change outside those capability directories, and any other uncommitted path.

#### Scenario: The archive outputs and a parallel draft are accepted

- **WHEN** the only uncommitted paths are the source change deletions, the archived directory, the named `openspec/specs` capability directories and another change's planning directory, and the index is empty
- **THEN** `archive` stages the archive outputs and commits

#### Scenario: An unexpected path is uncommitted

- **WHEN** a path outside the source change directory, the archived directory, the capability directories the archived change names and another change's planning directory is uncommitted
- **THEN** `archive` refuses before committing and records `archive-failed`

#### Scenario: A spec change outside the change's capabilities

- **WHEN** a path under `openspec/specs` is uncommitted but the archived change names no such capability
- **THEN** `archive` refuses before committing and records `archive-failed`

#### Scenario: A leftover under the source change directory

- **WHEN** an untracked path remains under the source change directory after the archive
- **THEN** `archive` refuses before committing

#### Scenario: The git index carries staged changes

- **WHEN** the git index contains any staged path
- **THEN** `archive` refuses before staging

### Requirement: Path-scoped archive commit

`archive <n> --apply` without `--commit` SHALL require exactly one archived directory and a change name other than `.` or `..`, stage only the archived directory, the capability directories the archived change names under `openspec/specs`, and the source deletion, verify every staged path is in that set, commit `chore(openspec): archive <change>` with no body, and record the commit. `--commit <sha>` SHALL verify that commit is `HEAD`, changes only those paths and leaves the index empty.

#### Scenario: A parallel draft stays out of the archive commit

- **WHEN** another change's uncommitted planning directory exists and the archive has moved the landing change
- **THEN** the commit contains only the archived directory, the named capability directories and the source deletion, and the other change's directory stays untracked and uncommitted

#### Scenario: The archive commit has no body

- **WHEN** the command creates the archive commit
- **THEN** the subject is exactly `chore(openspec): archive <change>` and the body is empty

#### Scenario: A supplied commit changes a path outside the set

- **WHEN** `--commit <sha>` names `HEAD` and that commit changes a path outside the allowed set
- **THEN** the command refuses to record the archive commit

#### Scenario: The archived directory is missing or ambiguous

- **WHEN** no archived directory matches the change, or more than one matches it
- **THEN** the command refuses before staging and records the `archive-failed` phase

## MODIFIED Requirements

### Requirement: Landing candidate discovery

`candidates` SHALL be read-only and list open pull requests that carry `mergeable`, whose watch entry records the current head as `commented`, that satisfy every landing gate other than the latest-main preparation gate, with no other unfinished landing and no own `review-failed` landing. It SHALL report behind-`main` and same-repository flags, mark a behind same-repository entry syncable, refuse a behind fork entry for author update, and report the first refusal and a dirty worktree once.

#### Scenario: Eligible labeled pull request

- **WHEN** an open pull request carries `mergeable`, its watch entry records the current head as `commented`, every candidate gate passes, no other landing is unfinished and its own landing is not in the `review-failed` phase
- **THEN** `candidates` lists it with its number, head, change, base, behind-main state and same-repository flag

#### Scenario: Behind same-repository candidate

- **WHEN** an eligible pull request is same-repository and GitHub reports its branch behind `main`
- **THEN** `candidates` lists it with `syncable: true` so the run can update the branch

#### Scenario: Behind fork candidate

- **WHEN** an eligible pull request is cross-repository and GitHub reports its branch behind `main`
- **THEN** `candidates` refuses it with an author-update reason and lists no syncable entry

#### Scenario: The latest-main gate does not exclude the entry

- **WHEN** a same-repository pull request satisfies the candidate gates but its head does not contain `main`
- **THEN** `candidates` lists it with `syncable: true` instead of refusing it for the latest-main preparation gate

#### Scenario: Refused pull request

- **WHEN** an open pull request lacks the label, has an uncommented or moved watch entry, or fails another gate
- **THEN** `candidates` does not list it and reports the first refusal reason

#### Scenario: Another landing is unfinished

- **WHEN** another pull request holds an unfinished landing
- **THEN** `candidates` does not list this pull request and reports the unfinished landing

#### Scenario: Own landing recorded review-failed

- **WHEN** a pull request's own landing is in the `review-failed` phase
- **THEN** `candidates` does not list it and reports the recorded failure

#### Scenario: Dirty main worktree

- **WHEN** a path outside every `openspec/changes/` directory is uncommitted in the main worktree
- **THEN** `candidates` reports the blocked worktree once and lists no pull request

#### Scenario: Listing writes nothing

- **WHEN** `candidates` runs
- **THEN** it writes no watch or landing state and leaves the pull request unchanged

### Requirement: Archive on main after merge

After a matching merged tree, the session SHALL run `openspec_archive` on main and then `archive <n> --apply`, which commits the archive from the paths it owns, and SHALL push. The `push` command SHALL record the pushed head and verify local main equals `origin/main`. An archive, commit or push failure SHALL leave the pull request merged and the change active, and SHALL be retried from the recorded landing phase without merging again.

#### Scenario: Archive and push succeed

- **WHEN** the merged tree matches, `openspec_archive` succeeds and `archive --apply` commits the path-scoped archive
- **THEN** main carries the archive commit and the push command records the pushed head

#### Scenario: Archive fails after merge

- **WHEN** `openspec_archive` fails after the pull request is merged
- **THEN** the change stays active on main, the state records `archive-failed`, and a later attempt retries only archive

#### Scenario: A pre-existing archive commit is recorded

- **WHEN** the archive commit already exists and `archive <n> --commit <sha> --apply` runs
- **THEN** the command verifies the commit paths and records it without creating another commit

#### Scenario: Push fails after archive

- **WHEN** the archive commit exists but the push fails
- **THEN** the state records `push-pending` and a later attempt retries only push
