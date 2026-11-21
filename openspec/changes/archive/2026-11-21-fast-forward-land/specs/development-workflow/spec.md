# development-workflow delta

## RENAMED Requirements

- FROM: `### Requirement: Land sequences the merge and archive commits`
- TO: `### Requirement: Land sequences the land and archive commits`
- FROM: `### Requirement: Landed push verifies the merge and archive commits`
- TO: `### Requirement: Landed push verifies the land and archive commits`

## MODIFIED Requirements

### Requirement: Land sequences the land and archive commits

A maintainer worktree apply SHALL land as a fast-forward commit that carries the implementation and its documentation, followed by an archive commit that carries the archive and merged specs; both SHALL precede the push to `origin/main`. Land SHALL NOT create a merge commit.

#### Scenario: A worktree change is landed

- **WHEN** `openspec_apply_worktree action=land` completes
- **THEN** the land commit carries the implementation and its documentation
- **AND** the archive commit carries the archive and merged specs
- **AND** the two commits form a linear history
- **AND** both are pushed together after the archive commit

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

Before any push, the script SHALL require `approvedBy: "user"`, the current branch `main`, and a worktree clean apart from uncommitted paths under `openspec/changes/` directories other than the landed change's own directory. It SHALL require the resolved land commit and `archiveCommit` to be commits reachable from `HEAD`.

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

- **WHEN** the land commit or `archiveCommit` is not a commit in the local repository
- **THEN** the script fails and names the missing value

### Requirement: Landed push verifies the land and archive commits

The script SHALL require `HEAD` to equal `archiveCommit`, the commit tree of the resolved land commit to equal `featureTree`, and the diff from the land commit to `archiveCommit` to touch only the archived change, its former directory and `openspec/specs/`. A commit after the selected archive, a tree mismatch, or an unexpected path SHALL be refused.

#### Scenario: Merge tree does not match the review

- **WHEN** the tree of the land commit differs from the manifest `featureTree`
- **THEN** the script fails and names both values

#### Scenario: Archive commit touches implementation

- **WHEN** the diff from the land commit to `archiveCommit` contains a path outside the archived change, its former directory and `openspec/specs/`
- **THEN** the script fails and lists the unexpected paths

#### Scenario: Main is ahead of the landed archive

- **WHEN** `HEAD` contains commits after the selected `archiveCommit`
- **THEN** the script fails and asks for the latest landed manifest instead of pushing an unverified range

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

## ADDED Requirements

### Requirement: Landed push selects a land commit

`scripts/push-landed.mjs` SHALL accept `--land` to select a manifest by the resolved land commit prefix and SHALL keep `--merge` as a legacy alias. It SHALL resolve the landed commit from `landCommit`, falling back to legacy `mergeCommit`, and SHALL refuse a manifest whose two fields name different commits.

#### Scenario: --land selects a fast-forward manifest

- **WHEN** `--land` names one fast-forward manifest prefix
- **THEN** the script selects that manifest and reports the resolved land commit

#### Scenario: --merge stays a legacy alias

- **WHEN** an existing command passes `--merge` for a fast-forward or legacy manifest
- **THEN** the script selects by the same resolved land commit

#### Scenario: Two manifest fields disagree

- **WHEN** a manifest carries `landCommit` and `mergeCommit` with different commits
- **THEN** the script refuses the manifest instead of choosing one

### Requirement: Landed push documents the land fields

`docs/land-push.md` SHALL document the `--land` selector, the legacy `--merge` alias, the `landCommit` field, the legacy `mergeCommit` fallback and the fast-forward land sequence.

#### Scenario: The land fields are documented

- **WHEN** a maintainer reads the checks and recovery sections
- **THEN** the document names `--land`, `--merge`, `landCommit`, the legacy fallback and fast-forward
