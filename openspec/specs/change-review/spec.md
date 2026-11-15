# change-review Specification

## Purpose
Defines the change-scoped review record and the draft review that runs before apply. It owns policy locking, the artifact-based review object, self-review reports, findings, readiness and the apply gate.

## Requirements

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

`openspec_review` with `action: "start"` and `review: "draft"` SHALL require that no draft review record exists, the change artifacts, an intent string and a passing `openspec validate` result. It SHALL reject a change whose planning artifacts are incomplete or invalid. When a draft review record already exists, it SHALL refuse the start and name `openspec_review` with `action: "resume"`.

#### Scenario: Artifacts are valid

- **WHEN** the change has a valid proposal, specs, design, tasks and intent
- **THEN** the start returns a review id, round and artifact hash

#### Scenario: Validation fails

- **WHEN** the bundled validator reports a finding for the change
- **THEN** the start fails and returns the validator findings

#### Scenario: Intent is missing

- **WHEN** the start is called without an intent string
- **THEN** the start fails and asks for the user's goal and acceptance conditions

#### Scenario: The draft review already started

- **WHEN** a draft review record exists and `start` is called again
- **THEN** the call fails, names `openspec_review` with `action: "resume"` and leaves `intent.md` unchanged

### Requirement: Self-review writes the draft report

With `reviewers: 0`, `openspec_review` with `action: "self-report"` SHALL accept one report from the changer and write it as the round report. It SHALL reject a report with empty required fields, an unknown verdict, severity or axis, a mismatched finding id, a blocking finding without impact, rule or failure, or a contradictory verdict; text length and entry count SHALL NOT affect validity. After a report is accepted, it SHALL reject a second report for the same round.

#### Scenario: Self-review report is accepted

- **WHEN** the changer submits a valid report for the current draft round
- **THEN** the report is stored and the review status reflects its verdict

#### Scenario: Second report is refused

- **WHEN** the changer submits another report for a round that already has one
- **THEN** the call fails and the first report remains authoritative

#### Scenario: Long field text is accepted

- **WHEN** a report carries a finding whose `problem` or `evidence` exceeds 120 characters
- **THEN** the report is stored without a length error

#### Scenario: Many out-of-scope entries are accepted

- **WHEN** a report carries four or more `outOfScope` or `residualRisks` entries
- **THEN** the report is stored without a count error

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

### Requirement: Apply review is gated by its own policy

The apply review SHALL be enabled by the change policy and SHALL use its own round and wait limits. It SHALL be unavailable when the policy disables it or when the project has no git. When the project has no git repository, policy creation SHALL lock the apply review disabled even when the settings enable it.

#### Scenario: Policy disables apply review

- **WHEN** the change policy disables apply review
- **THEN** archive does not require an apply review

#### Scenario: Policy locks apply review settings

- **WHEN** a change is created with apply review enabled
- **THEN** later settings edits do not alter that change's apply review

#### Scenario: Project has no git at creation

- **WHEN** a change is created in a project without a git repository and the settings enable apply review
- **THEN** the locked policy has `reviews.apply.enabled` false and `git.enabled` false
- **AND** the apply review remains unavailable for that change

#### Scenario: Legacy no-git policy stays enabled in the record

- **WHEN** a policy written before this change enables apply review in a project without git
- **THEN** the policy still records `reviews.apply.enabled` true
- **AND** the review is unavailable and archive does not require it

### Requirement: One independent reviewer can run either review

The plugin SHALL accept `reviewers: 1` for draft and apply review. It SHALL start exactly one reviewer through a managed activation with caller delivery and the `openspec-reviewer` preset. It SHALL record the slot, child id and activation state.

#### Scenario: Draft review starts a reviewer

- **WHEN** a draft review starts with `reviewers: 1`
- **THEN** one reviewer activation starts and the record names its child id and slot

#### Scenario: Apply review starts a reviewer

- **WHEN** an apply review starts with `reviewers: 1`
- **THEN** one reviewer activation starts against the committed tree

#### Scenario: No reviewer service

- **WHEN** the subagent service is unavailable
- **THEN** the start fails instead of falling back to self-review

### Requirement: The changer waits for the reviewer report

`openspec_review` with `action: "wait"` SHALL wait for the reviewer's report or the review deadline. It SHALL return `waiting`, `ready` or `overdue`; it SHALL not treat a still-pending reviewer as pass. It SHALL poll at an interval read from `OPENSPEC_FLOW_REVIEW_POLL_MS`, defaulting to `250` milliseconds and accepting integer values from `10` to `60000`; an absent, non-numeric or out-of-range value SHALL use the default.

#### Scenario: Reviewer submits

- **WHEN** the reviewer submits a report before the deadline
- **THEN** wait returns and the readiness calculation runs

#### Scenario: Deadline passes

- **WHEN** no report arrives before the wait limit
- **THEN** wait returns `overdue`

#### Scenario: A caller overrides the poll interval

- **WHEN** `OPENSPEC_FLOW_REVIEW_POLL_MS` is set to a value in range
- **THEN** wait polls at that interval and still returns `waiting`, `ready` or `overdue` by the same rules

#### Scenario: An invalid poll interval falls back

- **WHEN** `OPENSPEC_FLOW_REVIEW_POLL_MS` is absent, non-numeric or outside `10`-`60000`
- **THEN** wait polls every 250 milliseconds

### Requirement: Reviewer failures can be handled without a new round

`openspec_review` SHALL accept `retry`, `replace` and `waive-reviewer` for the single slot. `retry` SHALL message the same reviewer, `replace` SHALL start a new reviewer and record the reason, and `waive-reviewer` SHALL require user approval and mark the coverage gap. `retry` and `replace` SHALL NOT be limited by a count; each call SHALL append to the slot's retry count or replacement history.

#### Scenario: A blocked reviewer is replaced

- **WHEN** the user replaces a blocked reviewer
- **THEN** the slot names the new child id and keeps the round number

#### Scenario: Reviewer coverage is waived

- **WHEN** the user waives the reviewer
- **THEN** the review may become ready only through the coverage-gap path

#### Scenario: A reviewer is retried twice

- **WHEN** the changer calls `retry` twice for the same reviewer
- **THEN** both calls message that reviewer and the slot records two retries

#### Scenario: A reviewer is replaced twice

- **WHEN** the changer calls `replace` twice
- **THEN** each call starts a new reviewer and the replacement history holds both entries

### Requirement: A waived reviewer is a coverage gap

A record with a user-waived reviewer SHALL skip the missing-report requirement but SHALL still require the artifact or tree hash, finding dispositions and a passing verdict from the remaining review content.

#### Scenario: Waived reviewer with no findings

- **WHEN** the reviewer is waived and no finding is open
- **THEN** readiness may pass with `coverageGap`

#### Scenario: Waived reviewer with an open blocker

- **WHEN** an open critical or major finding exists
- **THEN** readiness still fails

### Requirement: The reviewer model is locked per change

The policy SHALL carry one concrete reviewer model for draft and one for apply. `source: "inherit"` SHALL resolve to the changer's current provider, model and effort when the policy is locked; an unresolvable inherit SHALL fail the policy write. The concrete model MAY omit `reasoningEffort` when that model exposes no selectable effort, and the reviewer then follows the adapter default. The policy SHALL NOT change when the configuration page is edited later.

#### Scenario: Inherit resolves at lock time

- **WHEN** a new change locks a review with `source: "inherit"`
- **THEN** the policy contains the resolved provider, model and effort

#### Scenario: Inherit cannot resolve

- **WHEN** the changer has no current model at lock time
- **THEN** the change is not created

#### Scenario: The page edits defaults after locking

- **WHEN** the user changes the reviewer model after a change is locked
- **THEN** that change's policy keeps the old model

### Requirement: The reviewer activation uses the locked model

`openspec_review` SHALL pass the locked model as `agentOptions` to the reviewer activation. It SHALL reject an unavailable provider, model or reasoning effort before starting the child.

#### Scenario: The reviewer starts

- **WHEN** a reviewer activation starts for a locked explicit model
- **THEN** `agentOptions` carries that provider, model and effort

#### Scenario: The locked model is unavailable

- **WHEN** the provider or model no longer resolves
- **THEN** the start fails before an activation is created

#### Scenario: An older policy has no model

- **WHEN** a policy written before this change starts a reviewer
- **THEN** the plugin resolves inherit once and records it in the policy

### Requirement: Reviewer activation uses the subagent service contract

The plugin SHALL pass the parent agent, prompt, preset, model options, working directory and cancellation signal as top-level fields of the subagent activation request. It SHALL NOT wrap them in a nested request object. It SHALL reject an activation whose caller agent is missing before starting a child.

#### Scenario: An activation carries the caller at the top level

- **WHEN** the plugin starts an independent reviewer
- **THEN** the subagent service receives `parent`, `prompt`, `agentPreset`, `agentOptions` and `signal` as top-level fields

#### Scenario: A missing caller agent is refused

- **WHEN** the changer agent is unavailable at activation time
- **THEN** the call fails before any child is created

### Requirement: Each review round wakes the reviewer

For a change with `reviewers: 1`, resuming into a new draft or apply round SHALL wake the review's existing reviewer to read the new brief; it SHALL NOT start another reviewer. Resuming a round whose reviewer has not submitted SHALL NOT wake it again. The slot SHALL keep the same agent and record the round it was woken for. `replace` remains the only way to start a new reviewer.

#### Scenario: A new draft round wakes the same reviewer

- **WHEN** the latest draft round has a report and `resume` opens the next draft round
- **THEN** a wake message is sent to the slot reviewer, the slot keeps its agent id and records the new round
- **AND** no new reviewer activation starts

#### Scenario: A new apply round wakes the same reviewer

- **WHEN** the latest apply round has a report and `resume` opens the next apply round
- **THEN** a wake message is sent to the slot reviewer, the slot keeps its agent id and records the new round
- **AND** no new reviewer activation starts

#### Scenario: Resuming an unreported round does not wake again

- **WHEN** the latest round has no report and `resume` reuses it
- **THEN** no wake message is sent and the slot keeps its agent

#### Scenario: The same reviewer submits for the new round

- **WHEN** the slot reviewer submits a report for the new round
- **THEN** the submission is accepted

#### Scenario: A first round with no slot activates a reviewer

- **WHEN** `start` opens a review with `reviewers: 1` and the record has no reviewer slot
- **THEN** one reviewer activation starts

### Requirement: The draft brief is neutral about authorship

The draft brief SHALL use one opening for both review modes that asks for an adversarial review and does not assert who wrote the planning material. It SHALL NOT address the reader as the changer or state that the reader wrote the material.

#### Scenario: Changer reads the self-review brief
- **WHEN** a draft review with `reviewers: 0` returns the brief to the changer
- **THEN** the opening asks for an adversarial review
- **AND** it does not claim the changer wrote the material

#### Scenario: Independent reviewer reads the brief
- **WHEN** a draft review with `reviewers: 1` starts an independent reviewer and the reviewer reads the brief
- **THEN** the opening asks for an adversarial review
- **AND** it does not claim the reviewer wrote the material

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

### Requirement: The draft intent is written once

The first draft `start` SHALL write `intent.md` and bind its hash into the review object. `resume` SHALL read that file, SHALL NOT rewrite it and SHALL refuse an `intent` argument. It SHALL refuse a file whose hash differs from the recorded intent hash. After the first start, the draft object hash SHALL change only through the change artifacts.

#### Scenario: Resume keeps the recorded intent

- **WHEN** `resume` opens another draft round
- **THEN** `intent.md` keeps its bytes and the new round binds the same intent hash

#### Scenario: Resume refuses an intent argument

- **WHEN** `resume` is called with a non-empty `intent`
- **THEN** the call fails, names `openspec_review` with `action: "start"` and leaves the recorded intent unchanged

#### Scenario: Resume refuses an edited intent file

- **WHEN** `intent.md` no longer hashes to the recorded intent hash
- **THEN** the call fails and asks for the review record to be removed before the draft review starts again

### Requirement: Apply review validates the committed tree strictly

`openspec_review` with `review: "apply"` SHALL run `openspec validate` with the strict option for the committed change before opening a start or resume round. It SHALL refuse the round when validation reports an issue, naming each issue, and SHALL NOT create or advance a round. The apply review brief SHALL carry the host's validation result so the reviewer does not run validation itself.

#### Scenario: Apply review starts after a strict pass

- **WHEN** the committed change passes `openspec validate --strict`
- **THEN** the apply review start opens a round and the brief records the strict pass

#### Scenario: Strict validation reports a warning

- **WHEN** the committed change has a strict-only warning
- **THEN** the apply review start or resume fails and names the issue
- **AND** no round is opened

#### Scenario: Reviewer reads the validation result

- **WHEN** the reviewer reads the apply review brief
- **THEN** the brief states the host validated the tree strictly and the reviewer is not expected to run validation

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
