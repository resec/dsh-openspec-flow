# change-review Specification

## Purpose

Defines the change-scoped review record and the draft review that runs before apply. It owns policy locking, the artifact-based review object, self-review reports, findings, readiness and the apply gate.

## ADDED Requirements

### Requirement: Review policy is locked when a change is created

The plugin SHALL resolve and write the review policy before `openspec_new_change` creates a change. The policy SHALL carry the draft review switch, reviewer count, round cap and wait cap. A settings change made after the policy is written SHALL NOT alter that change's review behavior. A failed policy write SHALL leave no change directory.

#### Scenario: A new change locks its policy

- **WHEN** the user creates a change with the draft review enabled
- **THEN** the change's review directory contains `policy.json` with the resolved draft review settings
- **AND** later settings edits do not alter that file

#### Scenario: Policy write fails

- **WHEN** the plugin cannot write the policy file
- **THEN** `openspec_new_change` fails and creates no change directory

#### Scenario: A change created outside the tool is locked on first start

- **WHEN** a change has no policy and the first `openspec_review` start runs
- **THEN** the plugin writes the policy from the current settings and continues

### Requirement: Review records live under the OpenSpec review root

The plugin SHALL store review records at `openspec/.review/<store>#<change>/`, using `local#<change>` when no store is selected. It SHALL ensure `openspec/.gitignore` contains `.review/`. Before a record is written, the plugin SHALL verify that `git check-ignore` accepts the record path when the project is a git repository; a project without git SHALL still use the same path.

#### Scenario: First review creates the record root

- **WHEN** a review starts for a project without `openspec/.review/`
- **THEN** the plugin creates the directory and adds `.review/` to `openspec/.gitignore`

#### Scenario: Record path is ignored

- **WHEN** the project is a git repository and the record path is not ignored
- **THEN** the review start fails with an actionable error instead of writing a tracked record

#### Scenario: Store-scoped change

- **WHEN** a change belongs to a registered store
- **THEN** its review directory is named `<store>#<change>`

### Requirement: Draft review object is the change artifacts

The draft review SHALL bind the contents of `proposal.md`, `specs/**`, `design.md`, `tasks.md`, `.openspec.yaml` and the intent text into one `changeHash`. It SHALL NOT require git, a commit or a clean tree. Any change to one of those inputs SHALL invalidate the recorded hash.

#### Scenario: Start records the artifact hash

- **WHEN** a draft review starts for a change with all required artifacts
- **THEN** the record contains `objectKind: "change"` and a `changeHash`
- **AND** the intent text is stored and hashed

#### Scenario: Artifacts change after the review

- **WHEN** an artifact's bytes differ from the recorded hash
- **THEN** the review is not ready and the tool names the stale object

#### Scenario: Project has no git

- **WHEN** a draft review starts outside a git repository
- **THEN** the review still starts and records the artifact hash

### Requirement: Draft review validates artifacts before starting

`openspec_review` with `action: "start"` and `review: "draft"` SHALL require the change artifacts, an intent string and a passing `openspec validate` result. It SHALL reject a change whose planning artifacts are incomplete or invalid.

#### Scenario: Artifacts are valid

- **WHEN** the change has a valid proposal, specs, design, tasks and intent
- **THEN** the start returns a review id, round and artifact hash

#### Scenario: Validation fails

- **WHEN** the bundled validator reports a finding for the change
- **THEN** the start fails and returns the validator findings

#### Scenario: Intent is missing

- **WHEN** the start is called without an intent string
- **THEN** the start fails and asks for the user's goal and acceptance conditions

### Requirement: Self-review writes the draft report

With `reviewers: 0`, `openspec_review` with `action: "self-report"` SHALL accept one report from the changer and write it as the round report. It SHALL reject a malformed report. After a report is accepted, it SHALL reject a second report for the same round.

#### Scenario: Self-review report is accepted

- **WHEN** the changer submits a valid report for the current draft round
- **THEN** the report is stored and the review status reflects its verdict

#### Scenario: Second report is refused

- **WHEN** the changer submits another report for a round that already has one
- **THEN** the call fails and the first report remains authoritative

### Requirement: Draft findings carry severity and a lifecycle

Every finding SHALL carry an id matching `R<round>-NN`, a severity from critical, major, minor and nit, an axis, a location, a problem, evidence and a suggestion. Critical and major findings SHALL also carry impact, rule and failure. Findings SHALL move through open, fixed, verified, deferred, rejected and waived; critical and major findings SHALL only be fixed or waived.

#### Scenario: Critical finding lacks required evidence

- **WHEN** a report contains a critical finding without impact, rule or failure
- **THEN** the report is rejected

#### Scenario: Blocker is deferred

- **WHEN** a caller tries to defer a major finding
- **THEN** the disposition is rejected

#### Scenario: Fixed finding is verified

- **WHEN** a later report returns a verification with status `verified-fixed` for a fixed finding
- **THEN** the finding becomes `verified` and records the verification round and time

### Requirement: Draft readiness gates apply

The draft review SHALL be ready only when its latest report is valid, its verdict is `pass`, every critical or major finding is verified or waived, every finding has a disposition, and the current artifact hash equals the recorded hash. `openspec_apply_next` SHALL refuse to start apply while an enabled draft review is not ready.

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

### Requirement: Apply base is recorded when draft review is ready

When `openspec_apply_next` proceeds in a git repository, the plugin SHALL record the current `HEAD` as the apply base commit in the draft review record. It SHALL omit the base when the project has no git.

#### Scenario: Git project records the base

- **WHEN** a ready draft review is followed by `openspec_apply_next` in a git project
- **THEN** the review record gains the apply base commit

#### Scenario: Non-git project has no base

- **WHEN** the project has no git repository
- **THEN** the review record has no apply base and apply review remains unavailable

### Requirement: Extend changes limits with user approval

`openspec_review` with `action: "extend"` SHALL accept a positive minute extension or a round cap of a positive integer or `unlimited`. It SHALL require `approvedBy: "user"` and a reason, record the extension, and never change the locked policy.

#### Scenario: Wait is extended

- **WHEN** the user approves a 15 minute extension
- **THEN** the current round's deadline moves and the extension is recorded

#### Scenario: Round cap becomes unlimited

- **WHEN** the user approves `maxRounds: "unlimited"`
- **THEN** the review accepts further rounds and the policy file is unchanged

### Requirement: Review state writes are serialized and atomic

Every review mutation SHALL hold a review-directory lock and write records through a temporary file followed by a rename. A failed write SHALL leave the previous bytes intact.

#### Scenario: Two starts race

- **WHEN** two starts target the same change and review
- **THEN** one acquires the lock and the other reports the holder

#### Scenario: Write fails before rename

- **WHEN** a record write fails before its rename
- **THEN** the previous record remains readable and unchanged
