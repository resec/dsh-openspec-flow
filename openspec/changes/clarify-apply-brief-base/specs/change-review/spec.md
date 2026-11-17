# Spec Delta: change-review

## ADDED Requirements

### Requirement: Apply review brief names the base reference and its source

The apply review brief SHALL name the base reference and identify its source as the seal commit recorded by the first `openspec_apply_next`, an explicit base passed to the round, or `git merge-base HEAD origin/main`.

#### Scenario: The base is the seal commit

- **WHEN** the apply review starts after a git seal
- **THEN** the brief names the seal commit as the base reference
- **AND** the brief identifies the source as the seal commit

#### Scenario: The base is explicit

- **WHEN** the apply review uses an explicit base
- **THEN** the brief names the explicit base as the base reference and identifies the source as explicit, not a seal commit

#### Scenario: The base is the merge base

- **WHEN** the apply review falls back to `git merge-base HEAD origin/main`
- **THEN** the brief names the merge base as the base reference and identifies the source as merge-base, not a seal commit

### Requirement: Apply review brief states the diff scope and empty-diff meaning

The apply review brief SHALL state that the diff starts at the base tree and covers only what differs between the base tree and the committed current tree, that the whole committed tree is the review object and the diff is not the review scope, and that an empty diff means the committed tree equals the base tree, not that the change needs no implementation. It SHALL ask the reviewer to check every task and delta requirement against the tree.

#### Scenario: The diff is described as a view, not the scope

- **WHEN** the reviewer reads the apply review brief
- **THEN** the brief states that the diff starts at the base tree and covers only what differs between the base tree and the committed current tree
- **AND** the brief states that the whole committed tree is the review object and the diff is not the review scope

#### Scenario: The diff is empty

- **WHEN** the apply brief is generated for a committed current tree equal to the base tree
- **THEN** the brief states that the empty diff does not mean the change needs no implementation
- **AND** the brief asks the reviewer to check every task and delta requirement against the tree

## MODIFIED Requirements

### Requirement: Apply review object is the committed git tree

The apply review SHALL bind the git tree of the current `HEAD` commit. It SHALL require a git repository, a resolved commit and a working tree that is clean except for uncommitted paths under other `openspec/changes/**` directories. A project without git SHALL NOT offer apply review. Any other working-tree change after start SHALL invalidate the review, and a tree change SHALL invalidate it.

#### Scenario: Apply review starts on a clean commit

- **WHEN** a change has a clean working tree and a commit
- **THEN** the apply review records the commit and tree hashes
- **AND** the base is the draft review's base commit, an explicit `base` passed to the round, or `git merge-base HEAD origin/main`

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

### Requirement: Apply review uses the draft base and report lifecycle

The apply review SHALL reuse the draft review report, finding, severity and readiness contract. It SHALL record its own rounds and findings, and its `ready` result SHALL require a passing latest report, no open blocking finding, all dispositions, a matching `treeSha`, and every drift file inside the plan-change waiver file set.

#### Scenario: Apply review passes

- **WHEN** the latest apply report passes, no blocker is open, the tree matches and every drift file is waived
- **THEN** the apply review is ready

#### Scenario: Apply review finds a blocker

- **WHEN** the latest report carries an open critical or major finding
- **THEN** the review is not ready and archive is refused

#### Scenario: Apply review starts from the seal commit

- **WHEN** the first apply round opens after a git seal and no explicit base is passed
- **THEN** its base is the draft record's apply base commit
- **AND** the diff covers the implementation and any plan change after the seal
