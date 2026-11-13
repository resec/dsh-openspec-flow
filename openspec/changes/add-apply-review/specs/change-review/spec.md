# change-review Specification Delta

## ADDED Requirements

### Requirement: Apply review object is the committed git tree

The apply review SHALL bind the git tree of the current `HEAD` commit. It SHALL require a git repository, a clean working tree and a resolved commit. A project without git SHALL NOT offer apply review. Any working-tree or tree change after start SHALL invalidate the review.

#### Scenario: Apply review starts on a clean commit

- **WHEN** a change has a clean working tree and a commit
- **THEN** the apply review records the commit and tree hashes
- **AND** the base is the draft review's base commit or `git merge-base HEAD origin/main`

#### Scenario: Working tree is dirty

- **WHEN** an apply review starts with uncommitted changes
- **THEN** the start fails and asks for a commit

#### Scenario: Project has no git

- **WHEN** apply review is requested outside a git repository
- **THEN** the start fails and reports that apply review is unavailable

#### Scenario: Tree changes after start

- **WHEN** `HEAD` resolves to another tree than the one recorded
- **THEN** the review is not ready and the gate refuses archive

### Requirement: Apply review binds the reviewed draft artifacts

An apply review SHALL require that the change artifacts inside the current tree still match the draft review's recorded artifact hash. A mismatch SHALL refuse the start and ask for a fresh draft review or a corrected commit.

#### Scenario: Applied tree matches the draft

- **WHEN** the current change artifacts equal the draft artifact hash
- **THEN** the apply review may start

#### Scenario: Applied tree changed the plan

- **WHEN** an artifact differs from the draft hash
- **THEN** the apply review start fails

### Requirement: Apply review uses the draft base and report lifecycle

The apply review SHALL reuse the draft review report, finding, severity and readiness contract. It SHALL record its own rounds and findings, and its `ready` result SHALL require a passing latest report, no open blocking finding, all dispositions, and a matching `treeSha`.

#### Scenario: Apply review passes

- **WHEN** the latest apply report passes, no blocker is open and the tree matches
- **THEN** the apply review is ready

#### Scenario: Apply review finds a blocker

- **WHEN** the latest report carries an open critical or major finding
- **THEN** the review is not ready and archive is refused

### Requirement: Apply review is gated by its own policy

The apply review SHALL be enabled by the change policy and SHALL use its own round and wait limits. It SHALL be unavailable when the policy disables it or when the project has no git.

#### Scenario: Policy disables apply review

- **WHEN** the change policy disables apply review
- **THEN** archive does not require an apply review

#### Scenario: Policy locks apply review settings

- **WHEN** a change is created with apply review enabled
- **THEN** later settings edits do not alter that change's apply review
