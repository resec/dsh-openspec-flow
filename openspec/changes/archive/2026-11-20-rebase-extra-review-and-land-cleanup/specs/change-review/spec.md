# Spec Delta

## ADDED Requirements

### Requirement: Rebase extra rounds do not consume normal round numbers

An apply review record SHALL carry recovery rounds in `extraRounds`, separate from `rounds`. Each entry SHALL carry `round` as `E<n>`, a numeric `seq` shared with normal rounds, `commitSha`, `treeSha`, `baseTreeSha`, `objectHash`, `startedAt`, brief, diff and an optional report. Recording an extra round SHALL NOT change the `rounds` length or the next normal round number.

#### Scenario: An extra round leaves the normal rounds unchanged

- **WHEN** the apply record holds two normal rounds and a rebase marker and the caller resumes after a rebase
- **THEN** the record gains `extraRounds` entry `E1` and `rounds` still holds two entries

#### Scenario: A second extra round follows the first

- **WHEN** the latest extra round has a report, no recorded finding is open and the latest extra round is not ready
- **THEN** resume opens `E2` while the normal rounds are unchanged

#### Scenario: The sequence spans both round kinds

- **WHEN** the record holds normal round 2 then extra round `E1`
- **THEN** the entries carry `seq` 2 and 3

### Requirement: A rebase marker opens an extra round

While `rebaseReview` is present on an apply record, apply `resume` SHALL open or reuse an extra round instead of a normal round and SHALL bind the rebased commit, tree and base. A ready extra round SHALL NOT open another round; resume SHALL return its recorded brief.

#### Scenario: Resume opens the first extra round

- **WHEN** the marker is present and no extra round exists
- **THEN** resume opens `E1` with the rebased commit, tree and base

#### Scenario: An unreported extra round is reused

- **WHEN** the latest extra round has no report and resume is called
- **THEN** its token does not change and the recorded brief stays current

#### Scenario: A ready extra round does not open another

- **WHEN** the latest extra round is ready and resume is called
- **THEN** the recorded brief is returned and no extra round is opened

#### Scenario: A later extra round opens after an unready report

- **WHEN** the latest extra round has a report, no recorded finding is open and the round is not ready
- **THEN** resume opens the next extra round token

### Requirement: A rebase marker clears at the end of a completed land

The marker SHALL stay until land writes the manifest and the archived state. Land SHALL then clear it under the review-directory lock at the end of the land critical section. When the rebased `HEAD^{tree}` equals the marker's reviewed tree, `resume` SHALL clear the marker without opening a round. An unready report or a failed archive, archive commit or manifest write SHALL NOT clear it.

#### Scenario: Land clears the marker after the manifest

- **WHEN** land writes the manifest and the archived state for an extra round land
- **THEN** `rebaseReview` is removed from the apply record

#### Scenario: A failed archive keeps the marker

- **WHEN** the archive or manifest write fails after the merged-tree check
- **THEN** the marker stays and a retry resolves the extra round tree

#### Scenario: A rebased tree that did not change clears on resume

- **WHEN** the marker is present and the rebased `HEAD^{tree}` equals its recorded reviewed tree
- **THEN** resume clears the marker and returns the recorded brief without opening an extra round

#### Scenario: An unready report keeps the marker

- **WHEN** the latest extra report is not ready
- **THEN** `rebaseReview` stays

### Requirement: Extra rounds use the extra round finding id

An extra round SHALL reuse the report, finding, severity, disposition, waiver and readiness contract. Its finding ids SHALL match `E<n>-NN`; a normal round keeps `R<round>-NN`. A finding SHALL record numeric `firstRound`/`verifiedInRound` from the shared sequence plus `firstRoundToken`/`verifiedInRoundToken`. Status SHALL report `roundToken` and `extraRounds`, and a wakeup SHALL name the token.

#### Scenario: An extra report records an extra id

- **WHEN** an extra round report carries finding `E1-01`
- **THEN** the finding is accepted and stored in the record's findings

#### Scenario: A normal id is refused in an extra round

- **WHEN** an extra round report carries a finding id `R1-01`
- **THEN** the report is rejected

#### Scenario: Status lists extra rounds

- **WHEN** the apply record carries `E1` with a report
- **THEN** status names `roundToken` `E1`, its verdict and the extra rounds

#### Scenario: Wakeup names the extra round

- **WHEN** a new extra round opens for an independent reviewer
- **THEN** the wake message names the extra round token

### Requirement: A ready extra round supplies the required land tree

While the marker is present, land SHALL require a ready extra round and SHALL use its `treeSha` as the required tree. Without a ready extra round, land SHALL refuse before merging and name `openspec_review action=resume review=apply`. The marker SHALL be cleared only after land binds that tree.

#### Scenario: Land uses the ready extra round tree

- **WHEN** the marker is present and the latest extra round is ready
- **THEN** land verifies the worktree head and merged tree against that extra round's tree

#### Scenario: Land waits for an extra round

- **WHEN** the marker is present and no extra round is ready
- **THEN** land refuses before merging and names the resume step

## MODIFIED Requirements

### Requirement: Draft findings carry severity and a lifecycle

Every finding SHALL carry an id matching `R<round>-NN` for a normal round or `E<n>-NN` for an extra round, a severity from critical, major, minor and nit, an axis, a location, a problem, evidence and a suggestion. Critical and major findings SHALL also carry impact, rule and failure. Findings SHALL move through open, fixed, verified, deferred, rejected and waived; critical and major findings SHALL only be fixed or waived.

#### Scenario: Critical finding lacks required evidence

- **WHEN** a report contains a critical finding without impact, rule or failure
- **THEN** the report is rejected

#### Scenario: Blocker is deferred

- **WHEN** a caller tries to defer a major finding
- **THEN** the disposition is rejected

#### Scenario: Fixed finding is verified

- **WHEN** a later report returns a verification with status `verified-fixed` for a fixed finding
- **THEN** the finding becomes `verified` and records the verification round and time

### Requirement: Apply review uses the draft base and report lifecycle

The apply review SHALL reuse the draft review report, finding, severity and readiness contract. It SHALL record its own rounds and findings, and its `ready` result SHALL require a passing latest report, no open blocking finding, all dispositions, a matching `treeSha`, and every drift file inside the plan-change waiver file set. While `rebaseReview` is present, the matching tree SHALL be the latest extra round's tree.

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

#### Scenario: An extra round owns the ready tree

- **WHEN** the marker is present and the latest extra round passes
- **THEN** readiness compares the tree against that extra round's `treeSha`

### Requirement: Land binds a ready apply review to the merged tree

When apply review is enabled and ready, its recorded tree SHALL equal the worktree `HEAD^{tree}` at land start. A ready extra round named by `rebaseReview` SHALL supply that tree while the marker is present. Land SHALL verify the `--no-ff` merged tree still equals that tree before archiving, inside the same lifecycle critical section.

#### Scenario: Land verifies the reviewed tree

- **WHEN** land starts for a ready apply review
- **THEN** it checks the recorded tree against the worktree head and the merged tree

#### Scenario: A stale reviewed tree is refused

- **WHEN** the worktree head or the merged tree differs from the required tree
- **THEN** land refuses and does not archive

#### Scenario: Archive follows the tree check

- **WHEN** the merged tree matches
- **THEN** archive runs before the lifecycle lock is released

#### Scenario: A ready extra round owns the required tree

- **WHEN** `rebaseReview` is present and the latest extra round is ready
- **THEN** its `treeSha` is the required tree
