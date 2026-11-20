# Spec Delta

## ADDED Requirements

### Requirement: Landed main push requires a verified manifest

The repository SHALL provide `scripts/push-landed.mjs`. It SHALL select a manifest under `<git common dir>/openspec-flow/landed/` by latest `landedAt`, `--change`, `--merge` or `--manifest`, refuse a missing or incomplete manifest, default to a dry run, and push only with `--push`. It SHALL exit 0 on success or an already-pushed remote, 1 on a refused check or remote failure, and 2 on usage errors.

#### Scenario: Default run does not push

- **WHEN** the maintainer runs the script without `--push`
- **THEN** the script prints the selected manifest and the commit range and the remote is unchanged

#### Scenario: Missing manifest

- **WHEN** the landed directory has no manifest and no explicit manifest is passed
- **THEN** the script fails and names the directory it inspected

#### Scenario: Explicit selection

- **WHEN** `--change`, `--merge` or `--manifest` names exactly one landed record
- **THEN** the script uses that record and refuses an ambiguous or unmatched selection

### Requirement: Landed push validates manifest facts

Before any push, the script SHALL require `approvedBy: "user"`, the current branch `main`, and a worktree clean apart from uncommitted paths under `openspec/changes/` directories other than the landed change's own directory. It SHALL require `mergeCommit` and `archiveCommit` to be commits reachable from `HEAD`.

#### Scenario: Dirty file outside the change tree

- **WHEN** the main worktree has an uncommitted file outside `openspec/changes/`
- **THEN** the script fails before contacting the remote and names the changed paths

#### Scenario: Another change's planning file is uncommitted

- **WHEN** the only uncommitted paths are under another change's `openspec/changes/<name>/` directory
- **THEN** the script continues with the landed push checks

#### Scenario: The landed change's own directory is uncommitted

- **WHEN** the only uncommitted path is under the landed change's own `openspec/changes/<change>/` directory
- **THEN** the script fails and names that path

#### Scenario: Wrong branch

- **WHEN** the main worktree is not on `main`
- **THEN** the script fails and names the current branch

#### Scenario: Approval is not the user

- **WHEN** the manifest does not record `approvedBy: "user"`
- **THEN** the script fails and names the manifest

#### Scenario: Manifest commit is missing

- **WHEN** `mergeCommit` or `archiveCommit` is not a commit in the local repository
- **THEN** the script fails and names the missing value

### Requirement: Landed push verifies the merge and archive commits

The script SHALL require `HEAD` to equal `archiveCommit`, the commit tree of `mergeCommit` to equal `featureTree`, and the diff from `mergeCommit` to `archiveCommit` to touch only the archived change, its former directory and `openspec/specs/`. A commit after the selected archive, a tree mismatch, or an unexpected path SHALL be refused.

#### Scenario: Merge tree does not match the review

- **WHEN** the tree of `mergeCommit` differs from the manifest `featureTree`
- **THEN** the script fails and names both values

#### Scenario: Archive commit touches implementation

- **WHEN** the diff from `mergeCommit` to `archiveCommit` contains a path outside the archived change, its former directory and `openspec/specs/`
- **THEN** the script fails and lists the unexpected paths

#### Scenario: Main is ahead of the landed archive

- **WHEN** `HEAD` contains commits after the selected `archiveCommit`
- **THEN** the script fails and asks for the latest landed manifest instead of pushing an unverified range

### Requirement: Landed push reconciles the remote and is idempotent

The script SHALL use the repository's `origin` remote. Before deciding, it SHALL fetch `origin`'s main; a dry run SHALL perform the fetch too. It SHALL report success without pushing when the remote main equals `HEAD`, push only when the remote main is an ancestor of `HEAD`, and refuse a remote main ahead of `HEAD`, a diverged history or a missing remote main. A push SHALL invoke the pre-push hook and SHALL NOT pass `--no-verify` or push any ref other than `main`.

#### Scenario: Remote already contains the landed commit

- **WHEN** the fetched remote main equals `HEAD`
- **THEN** the script reports that nothing needs pushing and exits successfully without a push

#### Scenario: Remote is behind

- **WHEN** the fetched remote main is an ancestor of `HEAD`
- **THEN** an explicit `--push` pushes `HEAD` to the remote main

#### Scenario: Remote is ahead

- **WHEN** the fetched remote main contains commits not in `HEAD`
- **THEN** the script fails and asks for local reconciliation instead of force-pushing

#### Scenario: Histories diverged

- **WHEN** neither side is an ancestor of the other
- **THEN** the script fails and does not push

#### Scenario: Remote main is missing

- **WHEN** `origin` has no main branch
- **THEN** the script fails and names the missing remote ref

#### Scenario: Dry run fetches but does not push

- **WHEN** the script runs without `--push`
- **THEN** it fetches `origin` main to report the remote state and performs no push

#### Scenario: Pre-push gate runs

- **WHEN** `--push` executes
- **THEN** the repository's pre-push hook runs and the script does not bypass it

### Requirement: Landed push is documented

The repository SHALL document the command, dry-run default, exit codes, checked fields, the `npm run hooks:install` prerequisite for the pre-push gate, and recovery for a dirty tree, wrong branch, missing manifest, mismatched tree, missing remote main and diverged remote in `docs/land-push.md`. `AGENTS.md`, `README.md`, `docs/apply-worktree.md` and `docs/apply-worktree-dev.md` SHALL link that document.

#### Scenario: Documentation is reachable

- **WHEN** a maintainer opens the documented push section from any of the four entry points
- **THEN** the link resolves to `docs/land-push.md`

#### Scenario: Hook prerequisite is documented

- **WHEN** a maintainer reads `docs/land-push.md`
- **THEN** it names `npm run hooks:install` as the prerequisite for the pre-push gate

#### Scenario: Recovery is named

- **WHEN** a validation or remote check fails
- **THEN** the document names the condition and the command or correction that resolves it
