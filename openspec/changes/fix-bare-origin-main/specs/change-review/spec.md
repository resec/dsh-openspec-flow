# Spec Delta

## MODIFIED Requirements

### Requirement: Apply review object is the committed git tree

The apply review SHALL bind the git tree of the current `HEAD` commit. It SHALL require a git repository, a resolved commit and a working tree that is clean except for uncommitted paths under other `openspec/changes/**` directories. A project without git SHALL NOT offer apply review. Any other working-tree change after start SHALL invalidate the review, and a tree change SHALL invalidate it.

#### Scenario: Apply review starts on a clean commit

- **WHEN** a change has a clean working tree and a commit
- **THEN** the apply review records the commit and tree hashes
- **AND** the base is the draft review's base commit, an explicit `base` passed to the round, or `git merge-base HEAD refs/remotes/origin/main`

#### Scenario: Working tree is dirty

- **WHEN** an apply review starts with uncommitted changes outside other `openspec/changes/**` directories
- **THEN** the start fails and asks for a commit

#### Scenario: Another change's uncommitted artifacts are allowed

- **WHEN** an apply review starts while only other `openspec/changes/**` directories have uncommitted files
- **THEN** the start proceeds and records the tree

#### Scenario: Project has no git

- **WHEN** apply review is requested outside a git repository
- **THEN** the start fails and reports that apply review is unavailable

#### Scenario: Tree changes after start

- **WHEN** `HEAD` resolves to another tree than the one recorded
- **THEN** the review is not ready and the gate refuses archive

### Requirement: Apply review brief names the base reference and its source

The apply review brief SHALL name the base reference and identify its source as the seal commit recorded by the first `openspec_apply_next`, an explicit base passed to the round, or `git merge-base HEAD refs/remotes/origin/main`.

#### Scenario: The base is the seal commit

- **WHEN** the apply review starts after a git seal
- **THEN** the brief names the seal commit as the base reference
- **AND** the brief identifies the source as the seal commit

#### Scenario: The base is explicit

- **WHEN** the apply review uses an explicit base
- **THEN** the brief names the explicit base as the base reference and identifies the source as explicit, not a seal commit

#### Scenario: The base is the merge base

- **WHEN** the apply review falls back to `git merge-base HEAD refs/remotes/origin/main`
- **THEN** the brief names the merge base as the base reference and identifies the source as merge-base, not a seal commit

### Requirement: Standalone apply review has no draft baseline

An apply review started with `baseline: "none"` SHALL NOT require a draft record, intent, plan-drift check or plan-change waiver. When the caller explicitly passes `baseline: "none"`, it SHALL require an explicit base and refuse a change that already has a draft record; the record SHALL store `none`. It SHALL reuse the apply contract. When the draft policy is disabled, an omitted baseline SHALL record `none` and keep the existing base fallback; otherwise the default keeps the draft gate.

#### Scenario: A committed branch starts without a draft record

- **WHEN** a change has no draft review record and a clean committed tree, and the caller starts an apply review with `baseline: "none"` and an explicit base
- **THEN** the round opens, records the commit, tree and base, and records `baseline: "none"`

#### Scenario: The explicit base owns the diff scope

- **WHEN** a no-draft apply review starts with a base commit
- **THEN** the brief names that base as the explicit source and the diff starts at its tree

#### Scenario: No base is refused

- **WHEN** a caller explicitly passes `baseline: "none"` without a non-empty base
- **THEN** the call fails before writing a round and asks for `base`

#### Scenario: A draft-disabled omitted baseline keeps the base fallback

- **WHEN** the draft policy is disabled, the caller omits `baseline`, and no base is passed
- **THEN** the review opens and the base falls back to `git merge-base HEAD refs/remotes/origin/main`

#### Scenario: An existing draft record refuses the no-draft baseline

- **WHEN** a change already has a draft review record and the caller explicitly starts an apply review with `baseline: "none"`
- **THEN** the call fails before writing a round and names the draft review and the plan-change waiver path

#### Scenario: A draft-disabled policy records the none baseline

- **WHEN** a change's policy disables the draft review and the caller starts an apply review with an omitted baseline
- **THEN** the apply review opens and records `baseline: "none"`

#### Scenario: Plan drift checks are skipped

- **WHEN** a no-draft apply review runs after the change artifacts were committed on the branch
- **THEN** the review does not ask for a plan-change waiver and does not report draft drift

#### Scenario: Readiness still requires a report

- **WHEN** a no-draft apply review opens a round without a report
- **THEN** the review is not ready and the next action is the report action for its mode

#### Scenario: The default with an enabled draft policy still requires a draft

- **WHEN** the draft policy is enabled and a caller starts an apply review without `baseline` for a change with no draft review record
- **THEN** the call fails with the existing draft requirement
