# Spec Delta

## ADDED Requirements

### Requirement: Git projects seal the draft before apply

In a git repository, the first `openspec_apply_next` after a ready draft review SHALL require a clean working tree, a `HEAD` that changes at least one file under the change directory and no file outside it except `openspec/.gitignore`, and change artifacts matching the draft record hash. It SHALL record `HEAD` as the apply base commit. A project without git SHALL skip these checks. A store-backed change outside the project root SHALL skip these checks and record a warning.

#### Scenario: Seal commit is accepted

- **WHEN** the working tree is clean, `HEAD` changes only files under the change directory or `openspec/.gitignore`, and the artifact hash matches the draft record
- **THEN** `openspec_apply_next` proceeds and records `HEAD` as the apply base commit

#### Scenario: Dirty working tree is refused

- **WHEN** the change directory or another file has uncommitted changes
- **THEN** `openspec_apply_next` fails and asks for a commit before the seal

#### Scenario: Mixed commit is refused

- **WHEN** `HEAD` also changes files outside the change directory and `openspec/.gitignore`
- **THEN** `openspec_apply_next` fails and asks for a commit that contains only the change directory

#### Scenario: Seal commit without a change-directory file is refused

- **WHEN** `HEAD` changes no file or changes only `openspec/.gitignore`
- **THEN** `openspec_apply_next` fails and asks for a commit that contains the change directory

#### Scenario: Artifacts differ from the draft after sealing

- **WHEN** the change artifacts hash differs from the draft record hash
- **THEN** `openspec_apply_next` fails and asks for a resumed draft review or the reviewed version

#### Scenario: Project without git skips the seal

- **WHEN** the project has no git repository
- **THEN** the seal checks do not run and no apply base is recorded

#### Scenario: Store-backed change skips the seal

- **WHEN** the change belongs to a registered store whose change directory is outside the project root
- **THEN** the seal checks are skipped and the result carries a warning

### Requirement: Plan changes during apply need a user waiver

`openspec_review` with `action: "waive"` and `scope: "plan-change"` SHALL require that apply started, a non-empty `waiver`, `approvedBy: "user"` and an explicit `files` list, and SHALL record the waiver in the review directory. Apply has started when the draft record carries an apply base commit or an apply review record exists. Repeated waivers SHALL merge their file sets.

#### Scenario: Waiver is recorded

- **WHEN** apply started, the user approves a plan change, and the changer calls `waive` with `scope: "plan-change"`, the approval text and the changed files
- **THEN** the review directory carries the waiver text, approver, time and file list
- **AND** the apply review brief shows the waiver

#### Scenario: Waiver before apply started is refused

- **WHEN** `waive` with `scope: "plan-change"` runs before apply started
- **THEN** the call fails and asks for a resumed draft review instead

#### Scenario: Waiver is available before the first apply review round

- **WHEN** a task changes an artifact during the apply loop and the user approves the change
- **THEN** `waive` records the waiver without an existing apply review record
- **AND** the first apply review start accepts the drift

#### Scenario: Repeated waivers merge their files

- **WHEN** `waive` runs twice with different file lists
- **THEN** the recorded file set is their union and the latest text and time are kept

### Requirement: Apply review refuses an unwaived plan change

An apply review start or resume SHALL refuse a changed artifact outside the recorded plan-change waiver file set.

#### Scenario: Artifact outside the waiver is refused

- **WHEN** the current drift includes a file outside the recorded waiver file set
- **THEN** the apply review start or resume fails and names the unwaived files

## MODIFIED Requirements

### Requirement: Draft readiness gates apply

The draft review SHALL be ready only when its latest report is valid, its verdict is `pass`, every critical or major finding is verified or waived, every finding has a disposition, and either the current artifact hash equals the recorded hash or apply has started. `openspec_apply_next` SHALL refuse to start apply while an enabled draft review is not ready.

#### Scenario: Ready review passes apply

- **WHEN** the draft review has a passing report, no open blocker and a matching artifact hash
- **THEN** `openspec_apply_next` proceeds

#### Scenario: Open blocker blocks apply

- **WHEN** the latest report has an open major finding
- **THEN** `openspec_apply_next` fails and names `openspec_review` as the next step

#### Scenario: Review is disabled

- **WHEN** the change policy disables draft review
- **THEN** `openspec_apply_next` does not require a draft review

#### Scenario: Legacy change has no policy

- **WHEN** a change predates the review policy and no policy file exists
- **THEN** `openspec_apply_next` does not enforce the gate before the first review start

#### Scenario: Apply started ignores the artifact drift

- **WHEN** apply started and the change artifacts no longer equal the draft record hash
- **THEN** the draft review readiness no longer reports the hash mismatch
- **AND** the next action points at the apply review

#### Scenario: Apply resync after a plan change proceeds

- **WHEN** `openspec_apply_next` runs again after apply started and the plan changed
- **THEN** the draft hash mismatch does not refuse the call

### Requirement: Apply base is recorded when draft review is ready

When `openspec_apply_next` proceeds in a git repository, the plugin SHALL record the seal commit as the apply base commit in the draft review record. The seal commit SHALL change at least one file inside the change directory, SHALL change no file outside the change directory except `openspec/.gitignore`, and its change artifacts SHALL match the draft record. It SHALL omit the base when the project has no git or the change is store-backed outside the project root.

#### Scenario: Git project records the base

- **WHEN** a ready draft review is followed by `openspec_apply_next` in a git project and the seal commit is present
- **THEN** the review record gains that commit as the apply base commit

#### Scenario: Non-git project has no base

- **WHEN** the project has no git repository
- **THEN** the review record has no apply base and apply review remains unavailable

### Requirement: Apply review binds the reviewed draft artifacts

An apply review SHALL NOT refuse a start or resume when the change artifacts inside the current tree differ from the draft review's recorded artifact hash. It SHALL record the draft hash, current hash and changed artifact paths in the apply record and list them in the brief for the plan axes.

#### Scenario: Applied tree matches the draft

- **WHEN** the current change artifacts equal the draft artifact hash
- **THEN** the apply review may start or resume

#### Scenario: Applied tree changed the plan

- **WHEN** an artifact differs from the draft hash and the file is inside the waiver file set
- **THEN** the apply review start or resume opens a round
- **AND** the brief lists the changed artifacts on the plan axes

### Requirement: Apply review uses the draft base and report lifecycle

The apply review SHALL reuse the draft review report, finding, severity and readiness contract. It SHALL record its own rounds and findings, and its `ready` result SHALL require a passing latest report, no open blocking finding, all dispositions, a matching `treeSha`, and every drift file inside the plan-change waiver file set.

#### Scenario: Apply review passes

- **WHEN** the latest apply report passes, no blocker is open, the tree matches and every drift file is waived
- **THEN** the apply review is ready

#### Scenario: Apply review finds a blocker

- **WHEN** the latest report carries an open critical or major finding
- **THEN** the review is not ready and archive is refused

#### Scenario: Apply review starts from the seal commit

- **WHEN** the first apply round opens after a git seal
- **THEN** its base is the draft record's apply base commit
- **AND** the diff covers the implementation and any plan change after the seal

### Requirement: Resume continues a recorded review

`openspec_review` with `action: "resume"` SHALL continue a draft or apply review that has a record. It SHALL refuse a review with no record and name `openspec_review` with `action: "start"`. It SHALL open a new round when the latest round has a report, reuse the latest round when it has no report, return the recorded brief when a passing review already matches the current object, refuse an abandoned review, and refuse a draft resume once apply started.

#### Scenario: A recorded draft review opens another round

- **WHEN** the latest draft round has a report and `resume` is called before apply started
- **THEN** the next round is recorded with the current object hash and a new brief

#### Scenario: An unreported round is reused

- **WHEN** the latest round has no report and `resume` is called
- **THEN** the round number does not change and the recorded brief stays the one being reviewed

#### Scenario: A passing review returns its brief

- **WHEN** the review passed on the current object and `resume` is called before apply started
- **THEN** the recorded brief is returned and no new round is recorded

#### Scenario: An abandoned review is refused

- **WHEN** the recorded review is abandoned and `resume` is called
- **THEN** the call fails and states that the review was abandoned

#### Scenario: Resume without a record is refused

- **WHEN** `resume` is called for a change with no record of that review
- **THEN** the call fails and names `openspec_review` with `action: "start"`

#### Scenario: Draft resume after apply started is refused

- **WHEN** apply already started and `resume` with `review: "draft"` is called
- **THEN** the call fails and states that plan changes are reviewed by apply review with a user waiver
