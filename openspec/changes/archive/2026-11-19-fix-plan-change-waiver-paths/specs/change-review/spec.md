# Spec Delta

## MODIFIED Requirements

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

An apply review start or resume SHALL refuse a changed artifact outside the recorded plan-change waiver file set. The comparison SHALL use change-relative POSIX paths, so a file recorded in another accepted form still covers its drift.

#### Scenario: Artifact outside the waiver is refused

- **WHEN** the current drift includes a file outside the recorded waiver file set
- **THEN** the apply review start or resume fails and names the unwaived files

#### Scenario: A waiver recorded in another form covers its file

- **WHEN** the recorded waiver carries `openspec/changes/<change>/tasks.md` and the drift carries `tasks.md`
- **THEN** the apply review start or resume accepts the file
- **AND** the error does not name it as unwaived

## ADDED Requirements

### Requirement: Plan-change waiver paths are normalized

A plan-change waiver's `files` SHALL be normalized to POSIX paths relative to the change directory. Change-relative, project-relative and absolute paths under the change directory SHALL be accepted; an entry SHALL be refused when it escapes the change directory (a `..` path, an absolute path outside it, or a project-relative `openspec/` path outside it) or names another change. Start and resume SHALL compare the normalized set, and repeated waivers SHALL normalize before merging.

#### Scenario: Project-relative and absolute inputs are recorded change-relative

- **WHEN** a waiver receives `openspec/changes/<change>/proposal.md` and an absolute path to `tasks.md`
- **THEN** the recorded file set carries `proposal.md` and `tasks.md`

#### Scenario: Refused path names the accepted forms

- **WHEN** a waiver receives another change's artifact or a path that escapes the change directory
- **THEN** the call fails and names the refused file and the accepted path forms

#### Scenario: A project-relative path outside the change is refused

- **WHEN** a waiver receives `openspec/specs/theme/spec.md`
- **THEN** the call fails and names it as outside the change directory

#### Scenario: A store-backed change refuses a project-relative path

- **WHEN** the change directory is outside the project root and a waiver receives `openspec/changes/<change>/proposal.md`
- **THEN** the call fails and names the change-relative form to use instead

#### Scenario: A waived file need not exist

- **WHEN** the approved plan change creates a file that does not exist at waive time
- **THEN** the waiver records its normalized path

#### Scenario: A legacy record covers its drift

- **WHEN** a recorded waiver carries `openspec/changes/<change>/tasks.md` and the drift carries `tasks.md`
- **THEN** the next start or resume accepts the file

#### Scenario: Repeated waivers normalize before merging

- **WHEN** a recorded waiver carries a project-relative path and a second waiver carries the same file change-relative
- **THEN** the recorded set carries the file once in change-relative form

#### Scenario: An empty entry is dropped

- **WHEN** the tool receives `files: [' tasks.md ', '']`
- **THEN** the stored set carries `tasks.md` and the call succeeds

#### Scenario: A dot entry is refused

- **WHEN** a waiver receives `.` as a file
- **THEN** the call fails and names the refused entry

### Requirement: Plan-change waiver coverage is reported only when established

A plan-change waiver result SHALL report `ready: false` with a reason unless the apply review record exists, a non-empty drift exists, and every drift file is covered by the normalized set. When apply has started, a waiver SHALL still be recorded without a draft record, without `intent.md`, or before the first apply review record, and the result SHALL report coverage as not established.

#### Scenario: Waiver before the edit does not claim readiness

- **WHEN** apply started but no apply review record exists and no drift exists yet
- **THEN** the recorded waiver is kept and the result reports `ready: false` with a reason that coverage is checked when the apply review starts

#### Scenario: An empty drift after apply started does not claim readiness

- **WHEN** the apply record exists and no drift is pending
- **THEN** the result reports `ready: false` with a reason that no drift is pending

#### Scenario: A draft-disabled project still records the waiver

- **WHEN** the draft review is disabled, the apply review is enabled and a waiver is recorded
- **THEN** `plan-change-waiver.json` is written and the result reports `ready: false` without calling the missing draft record

#### Scenario: A draft record without a per-file list is treated as no drift

- **WHEN** the apply record exists and the legacy draft record carries no `artifactFiles`
- **THEN** the result reports `ready: false` and does not list every artifact as uncovered

#### Scenario: Fully covered drift reports readiness

- **WHEN** the apply record exists, the drift is non-empty and every drift file is covered
- **THEN** the result reports `ready: true` and names no uncovered file

#### Scenario: Uncovered drift is named

- **WHEN** the apply record exists and a drift file is not covered
- **THEN** the result names that file and reports `ready: false`

#### Scenario: A waiver with neither record is refused

- **WHEN** neither a draft record nor an apply record exists
- **THEN** the call fails and asks for a resumed draft review instead of recording the waiver
