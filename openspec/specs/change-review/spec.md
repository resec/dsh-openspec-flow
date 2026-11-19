# change-review Specification

## Purpose
Defines the change-scoped review record and the draft review that runs before apply. It owns policy locking, the artifact-based review object, self-review reports, findings, readiness and the apply gate.

## Requirements

### Requirement: Review policy is locked when a change is created

The plugin SHALL resolve and write the review policy before `openspec_new_change` creates a change. The policy SHALL carry the draft review switch, reviewer count and wait cap. A settings change made after the policy is written SHALL NOT alter that change's review behavior. A failed policy write SHALL leave no change directory.

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

The plugin SHALL store legacy review records at `openspec/.review/<store>#<change>/` when the project has no git repository or its git common directory cannot be resolved, using `local#<change>` when no store is selected. It SHALL ensure `openspec/.gitignore` contains `.review/` unless `git check-ignore` already accepts the legacy directory. In a git repository, it SHALL verify before writing that `git check-ignore` accepts the path.

#### Scenario: First review creates the record root

- **WHEN** a review starts for a project without git, or a git project whose common directory cannot be resolved, and no rule ignores the legacy root
- **THEN** the plugin creates the directory and adds `.review/` to `openspec/.gitignore`

#### Scenario: A repository rule already ignores the review directory

- **WHEN** `git check-ignore` already accepts the legacy review directory
- **THEN** the plugin creates the directory and writes no `openspec/.gitignore`

#### Scenario: Record path is ignored

- **WHEN** the project is a git repository, uses the legacy root, and the record path is not ignored
- **THEN** the review start fails with an actionable error instead of writing a tracked legacy record

#### Scenario: The nested ignore file already covers the review directory

- **WHEN** `openspec/.gitignore` already contains the `.review/` line
- **THEN** the plugin writes no file

#### Scenario: Non-git projects keep the write behavior

- **WHEN** the project has no git repository
- **THEN** the plugin keeps writing the legacy ignore line

#### Scenario: A failed ignore check is conservative

- **WHEN** the git ignore check fails for a reason other than a clean miss on the legacy root
- **THEN** the plugin writes the ignore line instead of skipping it

#### Scenario: Store-scoped change

- **WHEN** a change belongs to a registered store
- **THEN** its review directory name is `<store>#<change>`

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

Before apply starts, the draft review SHALL be ready only when its latest report is valid, its verdict is `pass`, every critical or major finding is verified or waived, every finding has a disposition, no blocking requirement-length result is recorded, and the artifact hash matches. `openspec_apply_next` SHALL refuse to start apply while an enabled draft review is not ready; after apply starts, apply review rechecks the length result.

#### Scenario: Ready review passes apply

- **WHEN** the draft review has a passing report, no open blocker, no blocking length result and a matching artifact hash
- **THEN** `openspec_apply_next` proceeds

#### Scenario: Blocking length result blocks the first apply entry

- **WHEN** before apply starts, the draft record has a blocking length result and no open finding
- **THEN** `openspec_apply_next` fails and names `openspec_review` with `action: "resume"` and `review: "draft"`

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

#### Scenario: A started apply defers the length check

- **WHEN** apply started and the current artifacts carry a blocking length result
- **THEN** `openspec_apply_next` does not refuse the resync for that result
- **AND** apply review start or resume rechecks it

#### Scenario: Apply resync after a plan change proceeds

- **WHEN** `openspec_apply_next` runs again after apply started and the plan changed
- **THEN** the draft hash mismatch does not refuse the call

### Requirement: Apply base is recorded when draft review is ready

When `openspec_apply_next` proceeds in a git repository, the plugin SHALL record the seal commit as the apply base commit. The commit SHALL change at least one file inside the change directory and nothing outside it except the change's OpenSpec root `.gitignore` and other `openspec/changes/**` paths, and its change artifacts SHALL match the draft record. No base is recorded without git or for a store-backed change outside the project root.

#### Scenario: Git project records the base

- **WHEN** a ready draft review is followed by `openspec_apply_next` in a git project and the seal commit is present
- **THEN** the review record gains that commit as the apply base commit

#### Scenario: Non-git project has no base

- **WHEN** the project has no git repository
- **THEN** the review record has no apply base and apply review remains unavailable

#### Scenario: Another change's committed artifacts are accepted

- **WHEN** `HEAD` changes the change directory and also files under another `openspec/changes/**` path
- **THEN** the seal check proceeds and records the base

### Requirement: Review state writes are serialized and atomic

Every review mutation SHALL hold a review-directory lock and write records through a temporary file followed by a rename. A failed write SHALL leave the previous bytes intact.

#### Scenario: Two starts race

- **WHEN** two starts target the same change and review
- **THEN** one acquires the lock and the other reports the holder

#### Scenario: Write fails before rename

- **WHEN** a record write fails before its rename
- **THEN** the previous record remains readable and unchanged

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

- **WHEN** the first apply round opens after a git seal and no explicit base is passed
- **THEN** its base is the draft record's apply base commit
- **AND** the diff covers the implementation and any plan change after the seal

### Requirement: Apply review is gated by its own policy

The apply review SHALL be enabled by the change policy and SHALL use its own wait limit. It SHALL be unavailable when the policy disables it or when the project has no git. When the project has no git repository, policy creation SHALL lock the apply review disabled even when the settings enable it.

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

`openspec_review` with `action: "resume"` SHALL continue a draft or apply review that has a record. It SHALL refuse a review with no record and name `openspec_review` with `action: "start"`. It SHALL open a new round when the latest round has a report and no recorded finding is open, reuse the latest round when it has no report, return the recorded brief when a passing review already matches the current object, refuse an abandoned review, and refuse a draft resume once apply started.

#### Scenario: A recorded draft review opens another round

- **WHEN** the latest draft round has a report, no recorded finding is open, and `resume` is called before apply started
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

In a git repository, the first `openspec_apply_next` after a ready draft review SHALL require a clean tree, a `HEAD` that changes only the change directory, the root `.gitignore` and other `openspec/changes/**` paths, and matching change artifacts. Other changes' uncommitted planning files are ignored and paths compare worktree-relative. It SHALL record `HEAD` as the apply base. Without git, or for a store-backed change outside the project root, the checks are skipped; the latter adds a warning.

#### Scenario: Seal commit is accepted

- **WHEN** the working tree is clean apart from other change directories, `HEAD` changes only files under the change directory, the root's `.gitignore` or another `openspec/changes/**` path, and the artifact hash matches the draft record
- **THEN** `openspec_apply_next` proceeds and records `HEAD` as the apply base commit

#### Scenario: Nested root seal is accepted

- **WHEN** the change lives under a nested OpenSpec root and `HEAD` changes only that root's change directory and `.gitignore`
- **THEN** the worktree-relative comparison accepts the seal

#### Scenario: Dirty working tree is refused

- **WHEN** the change directory or a file outside `openspec/changes/` has uncommitted changes
- **THEN** `openspec_apply_next` fails and asks for a commit before the seal

#### Scenario: Another change's uncommitted artifacts are accepted

- **WHEN** only uncommitted files under another `openspec/changes/**` directory remain
- **THEN** the dirty-tree check passes and the seal proceeds

#### Scenario: Mixed commit is refused

- **WHEN** `HEAD` also changes a file outside the change directory, the root's `.gitignore` and `openspec/changes/`
- **THEN** `openspec_apply_next` fails and asks for a commit that contains only OpenSpec change paths

#### Scenario: Seal commit without a change-directory file is refused

- **WHEN** `HEAD` changes no file or changes only the root's `.gitignore`
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

An apply review start or resume SHALL refuse a changed artifact outside the recorded plan-change waiver file set. The comparison SHALL use change-relative POSIX paths, so a file recorded in another accepted form still covers its drift.

#### Scenario: Artifact outside the waiver is refused

- **WHEN** the current drift includes a file outside the recorded waiver file set
- **THEN** the apply review start or resume fails and names the unwaived files

#### Scenario: A waiver recorded in another form covers its file

- **WHEN** the recorded waiver carries `openspec/changes/<change>/tasks.md` and the drift carries `tasks.md`
- **THEN** the apply review start or resume accepts the file
- **AND** the error does not name it as unwaived

### Requirement: The changer checks the reviewer report without polling

`wait` SHALL NOT poll. It SHALL return `ready` when the latest round has a report or the reviewer is waived, `overdue` at the deadline, and `waiting` otherwise; `waiting` sets `waitState: "waiting"` and ends the turn. The result SHALL come from a post-write read that re-reads inside the lock and changes only `changerSessionId`. A best-effort card-marker write after the result SHALL be logged on failure and SHALL NOT change it. The deadline remains `waitMinutes`.

#### Scenario: Reviewer already submitted

- **WHEN** the latest round has a report before `wait` is called
- **THEN** `wait` returns `ready` and the readiness calculation runs

#### Scenario: No report before the deadline

- **WHEN** the latest round has no report and the deadline has not passed
- **THEN** `wait` returns `waiting` and instructs the changer to end its turn

#### Scenario: Deadline has passed

- **WHEN** the wait deadline has passed and no report arrived
- **THEN** `wait` returns `overdue`

#### Scenario: Wait does not sleep on a poll interval

- **WHEN** `wait` is called for a pending reviewer
- **THEN** it returns from the post-write read without a poll loop

#### Scenario: A contended card write keeps the wait result

- **WHEN** the card marker write cannot acquire the review lock
- **THEN** the failure is logged and `wait` returns the same `ready` result

### Requirement: A reviewer submit wakes the changer

A successful `openspec_reviewer` submit SHALL wake the changer through `subagents.sendMessage` with `steer` delivery. Targets SHALL be the recorded changer session and the pending-deadline waiter, deduplicated. The message SHALL name the change, review kind, round, verdict, readiness and next action (which may be `openspec_apply_next`, `openspec_archive` or an `openspec_review` action). A failed wakeup SHALL NOT fail or roll back the submission; it SHALL be logged.

#### Scenario: A submit wakes the changer

- **WHEN** the reviewer submits a report and the changer is idle
- **THEN** a steer message is delivered to the changer session

#### Scenario: A lock-skipped wait write still receives the wakeup

- **WHEN** a wait's session write was skipped by lock contention and the reviewer submits
- **THEN** that waiter is among the wakeup targets

#### Scenario: The reviewer has no addressable changer

- **WHEN** neither the review record nor the reviewer session names a changer session
- **THEN** the submission succeeds and no wakeup is sent

#### Scenario: A wakeup failure keeps the report

- **WHEN** the wakeup delivery throws after the report is written
- **THEN** the submission succeeds and a later `wait` reads the report

### Requirement: The wait deadline wakes the changer

A `wait` that returns `waiting` SHALL schedule a deadline wakeup for that round's `waitMinutes` and record the waiting session as its target. A later submission SHALL cancel it. When the deadline fires and the reviewer slot is still live, the plugin SHALL wake the recorded waiter with an `overdue` message. A later `wait` for the same round SHALL replace any pending deadline.

#### Scenario: The deadline fires

- **WHEN** `waitMinutes` passes with no report
- **THEN** the recorded waiter receives an overdue steer message

#### Scenario: The reviewer slot is not live

- **WHEN** the deadline fires and the reviewer slot is no longer live
- **THEN** no overdue wakeup is sent and a warning is logged

#### Scenario: A submission cancels the deadline

- **WHEN** the reviewer submits before the deadline
- **THEN** no overdue message is sent

#### Scenario: Repeating wait does not duplicate the deadline

- **WHEN** `wait` is called twice in the same round before the deadline
- **THEN** one pending deadline remains for that round

### Requirement: The review records the changer session

`openspec_review` `start`, `resume` and `wait` SHALL record the calling changer session on the review record under the review lock; the latest caller wins, and the submit and deadline wakeups SHALL address it. The `wait` write SHALL be best-effort: lock contention SHALL NOT fail the wait result. When the session is absent, the wakeups SHALL fall back to the reviewer session's parent session, and without either they SHALL skip the wakeup with a logged warning.

#### Scenario: A start records the changer

- **WHEN** `start` runs with the changer agent
- **THEN** the review record stores the changer session id

#### Scenario: A wait records the latest caller

- **WHEN** a second session calls `wait` on an existing review
- **THEN** the review record stores that second session and the submit and deadline wakeups target it

#### Scenario: A lock-contended wait write keeps the result

- **WHEN** the review lock is held while `wait` records the caller
- **THEN** `wait` logs the skipped write and still returns its wait state

#### Scenario: A legacy record has no changer session

- **WHEN** an older review record has no changer session and the reviewer session names a parent
- **THEN** the wakeup targets that parent session

#### Scenario: No changer identity is available

- **WHEN** the record has no changer session and the reviewer has no parent session
- **THEN** the submission succeeds without a wakeup and logs a warning

### Requirement: Finding dispositions accept an atomic batch

`openspec_review` with `action: "dispose"`, or `action: "waive"` without `scope: "plan-change"`, SHALL accept a `dispositions` array of entries that each name an `id` and the fields that apply. A `dispose` entry SHALL carry its own `status`. A call SHALL supply either `dispositions` or the single `id` form, not both. The batch SHALL validate every entry before writing and leave the record unchanged when any entry is invalid. The result SHALL carry one `dispositions` entry per finding.

#### Scenario: Several findings are disposed

- **WHEN** a call passes two valid entries in `dispositions`
- **THEN** both findings are disposed
- **AND** the result lists both ids and their statuses

#### Scenario: One entry is invalid

- **WHEN** one entry resolves and another entry is rejected
- **THEN** the call fails
- **AND** neither finding changes

#### Scenario: Duplicate id

- **WHEN** `dispositions` names the same finding twice
- **THEN** the call fails and the record is unchanged

#### Scenario: Both forms are supplied

- **WHEN** a call passes `id` and `dispositions`
- **THEN** the call fails and names the choice

#### Scenario: Single-form fields are refused with a batch

- **WHEN** a call passes `dispositions` with a top-level `status` or `note`
- **THEN** the call fails and names the batch form

#### Scenario: Single form still works

- **WHEN** a call passes `id`, `status` and `note` without `dispositions`
- **THEN** the single finding is disposed as before

#### Scenario: Batch waiver shares a default

- **WHEN** a `waive` call passes top-level `approvedBy` and `waiver` with two entries that omit them
- **THEN** both findings are waived with those values

### Requirement: Plan-change waiver stays separate from finding dispositions

`openspec_review` with `action: "waive"` and `scope: "plan-change"` SHALL keep its `files` contract and SHALL reject a `dispositions` argument. The finding batch SHALL NOT apply to that mode.

#### Scenario: Plan-change waiver rejects a batch

- **WHEN** a call passes `scope: "plan-change"` and `dispositions`
- **THEN** the call fails and names the plan-change form

#### Scenario: Plan-change waiver keeps files

- **WHEN** a user-approved plan change is recorded
- **THEN** the call takes `files` and no finding id

### Requirement: Deferred findings carry a note

A `deferred` disposition SHALL require a non-empty `note`; a follow-up issue reference SHALL be recorded inside that note. A disposition SHALL NOT accept an `issue` field, and the record SHALL NOT write one.

#### Scenario: Deferred without a note

- **WHEN** a caller defers a minor finding without a note
- **THEN** the disposition is rejected

#### Scenario: Issue field is refused

- **WHEN** a caller passes `issue` to a disposition
- **THEN** the parameter schema rejects the call

#### Scenario: Old record keeps its bytes

- **WHEN** a record written before this change carries a finding issue
- **THEN** readiness and the projections ignore it
- **AND** the record is not migrated

### Requirement: Dispositions travel only with dispose and waive

`openspec_review` with `action: "start"` or `action: "resume"` SHALL reject a `dispositions` argument and name the action that owns it. The batch SHALL be consumed only by `action: "dispose"` or a finding `action: "waive"`. A refused call SHALL NOT create a review record or advance a round. An empty `dispositions` array SHALL be rejected as well.

#### Scenario: Start carries dispositions

- **WHEN** `start` is called with a `dispositions` array
- **THEN** the call fails and names `action: "dispose"`
- **AND** no review record is created

#### Scenario: Resume carries dispositions

- **WHEN** `resume` is called with a `dispositions` array
- **THEN** the call fails and names `action: "dispose"`
- **AND** the record, round and findings are unchanged

#### Scenario: An empty dispositions array

- **WHEN** `start` or `resume` is called with `dispositions: []`
- **THEN** the call fails before any record is read

#### Scenario: Dispose still accepts the batch

- **WHEN** `action: "dispose"` is called with a valid `dispositions` array
- **THEN** every named finding is disposed as before

### Requirement: A refused verification reports the finding's current state

When a report carries a verification with status `verified-fixed` for a finding whose recorded status is `open`, `deferred` or `rejected`, the plugin SHALL refuse the report and report that status plus the changer's `openspec_review action=dispose review=<kind>` step with `status=fixed` and a note, using the review record's own kind. When the finding is already `verified` or `waived`, the refusal SHALL say the finding is closed and SHALL NOT direct another disposal.

#### Scenario: An open finding cannot be verified fixed

- **WHEN** a report verifies `R1-01` as `verified-fixed` and the recorded finding is still `open`
- **THEN** the report is refused
- **AND** the error names `open`, `action=dispose`, the review kind and `status=fixed`

#### Scenario: A deferred finding cannot be verified fixed

- **WHEN** a report verifies a finding as `verified-fixed` and the recorded finding is `deferred`
- **THEN** the report is refused and the error names `deferred`

#### Scenario: A verified finding is already closed

- **WHEN** a report verifies a `verified` finding as `verified-fixed`
- **THEN** the report is refused
- **AND** the error says the finding is closed and does not direct a disposal

#### Scenario: A waived finding is already closed

- **WHEN** a report verifies a `waived` finding as `verified-fixed`
- **THEN** the report is refused
- **AND** the error says the finding is closed

### Requirement: Draft reviews run concurrently across changes

The plugin SHALL scope every draft review operation to one change. Starting, resuming, reporting, waiting for or disposing one change's draft review SHALL NOT be refused or altered by another change's draft review. Draft records, reviewer slots and wait deadlines SHALL remain independent per change, and a project MAY hold several draft reviews at the same time.

#### Scenario: Two changes start draft reviews

- **WHEN** two changes each call `openspec_review` with `action: "start"` and `review: "draft"`
- **THEN** both records are written under their own review directories and both reports return `in-review`

#### Scenario: A report stays with its change

- **WHEN** the first change submits a self-report while the second change is in a draft round
- **THEN** only the first change's record advances and the second change's readiness is unchanged

#### Scenario: A ready draft does not block another draft

- **WHEN** the first change's draft review is ready and the second change resumes its own draft review
- **THEN** the second resume opens its next round without waiting for the first change

#### Scenario: Independent reviewers run side by side

- **WHEN** two changes with `reviewers: 1` start draft reviews
- **THEN** each change records its own reviewer slot and child session
- **AND** each submission updates only the change named in the reviewer call

### Requirement: One change holds its apply locks

The plugin SHALL keep apply locks. An implementation-domain lock SHALL be identified by the review key `<store>#<change>`. A store-domain lock SHALL also record the implementation root, so a second project is refused while the same root may re-enter. Every apply entry SHALL acquire every required lock; a lock naming a different identity SHALL refuse the call and name the holder and path. Draft review SHALL remain available.

#### Scenario: First ready change takes its locks

- **WHEN** a change whose draft review is ready calls `openspec_apply_next`
- **THEN** every lock it requires names that change and store, and records its change root, implementation root and start time

#### Scenario: A store change from another project is refused

- **WHEN** a store change is applied from a second project while the store lock records the first project
- **THEN** the call fails because the implementation roots differ

#### Scenario: Same name in another store is refused

- **WHEN** a change with the same name but a different store calls `openspec_apply_next` while the lock names the first
- **THEN** the call fails because the review keys differ

#### Scenario: Second change is refused on apply

- **WHEN** a change whose draft review is ready calls `openspec_apply_next` while the lock names a different review key
- **THEN** the call fails, the apply state is unchanged and the error names the holder

#### Scenario: Second change is refused on apply review

- **WHEN** a change calls `openspec_review` with `action: "start"` or `"resume"` and `review: "apply"` while the lock names a different review key
- **THEN** the call fails and names the holder

#### Scenario: Draft review continues while the lock is held

- **WHEN** a second change starts or resumes its own draft review while the lock names the first change
- **THEN** the draft review proceeds

#### Scenario: Failed seal releases new locks

- **WHEN** the seal check fails after this call acquired one or more locks
- **THEN** every lock acquired by this call is released and a later change can acquire them

#### Scenario: The same change re-enters apply

- **WHEN** `openspec_apply_next` or an apply review entry runs again from the same implementation root for the lock's review key
- **THEN** the call proceeds

### Requirement: The apply lock covers every apply entry

The lock SHALL be enforced regardless of git, store selection, the draft switch or a policy. It SHALL record a schema version, the change, store, change root, implementation root and start time.

#### Scenario: A draft-disabled change takes the lock

- **WHEN** a change whose policy disables draft review calls `openspec_apply_next`
- **THEN** it acquires the lock before apply proceeds

#### Scenario: A non-git project serializes apply

- **WHEN** a second change in a project without git calls `openspec_apply_next` while the lock names the first change
- **THEN** the second call fails and names the holder

### Requirement: The apply lock covers the implementation and store domains

Every change SHALL acquire the lock of its implementation domain: the session's git worktree root, else the nearest OpenSpec root at or above the session working directory, else the change's resolved root. A store-backed change SHALL also acquire the lock of its store domain. A git domain SHALL use its worktree git directory; any other domain SHALL use `openspec/.review/`.

#### Scenario: A store change and a local change share one project lock

- **WHEN** a store change and a local change in one project both call an apply entry
- **THEN** only one proceeds, because they share the implementation domain

#### Scenario: Two store changes from different stores serialize in one project

- **WHEN** two store changes from different stores are applied from one project
- **THEN** both use the project implementation lock and only one proceeds

#### Scenario: A store-backed change takes the store domain lock

- **WHEN** one store change is applied from two projects
- **THEN** both sessions also use the store domain's lock and only one proceeds

#### Scenario: Nested roots share one worktree lock

- **WHEN** two changes live under different OpenSpec roots inside one git worktree
- **THEN** both apply entries use the same implementation lock file

#### Scenario: Linked worktrees take separate locks

- **WHEN** two linked worktrees of one repository apply changes
- **THEN** each worktree uses its own git-directory lock and both may proceed

#### Scenario: Git domain lock leaves the tree clean

- **WHEN** a change inside a git worktree acquires its implementation lock
- **THEN** `git status --porcelain` reports no new path

#### Scenario: A session outside every root falls back

- **WHEN** a change is applied from a directory with no OpenSpec root above it and no git worktree
- **THEN** its implementation lock is written under the change's resolved root

### Requirement: Another change's uncommitted planning files do not block the lock holder

While a change holds its apply locks, the seal, apply review and archive clean-tree checks SHALL ignore uncommitted paths that fall under any `openspec/changes/` directory other than the reviewed change's own directory, matched on git worktree-relative paths. A path under the reviewed change's directory, or one that does not fall under an `openspec/changes/` directory, SHALL still count as dirty. A seal commit SHALL NOT contain those uncommitted paths unless the user stages them.

#### Scenario: Another draft's edits do not block the seal

- **WHEN** a second change has uncommitted artifact edits and the first change seals
- **THEN** the seal proceeds and commits only the first change's files

#### Scenario: Another root's draft edits do not block

- **WHEN** a parallel draft under a nested OpenSpec root has uncommitted edits and the holder seals, reviews or archives
- **THEN** the clean-tree check passes

#### Scenario: Another draft's edits do not block the apply review

- **WHEN** a second change has uncommitted artifact edits and the first change starts its apply review
- **THEN** the clean-tree check passes and the review opens

#### Scenario: Another draft's edits do not block archive

- **WHEN** a second change has uncommitted artifact edits and the first change archives
- **THEN** archive proceeds

#### Scenario: Code changes still block

- **WHEN** the working tree has an uncommitted path that is not under an `openspec/changes/` directory
- **THEN** the seal, apply review and archive still refuse

### Requirement: Archive completes the serial segment

`openspec_archive` SHALL refuse to archive a change while any present apply lock names a different identity. It SHALL proceed when no lock names another identity, and a successful archive SHALL release every lock that names the archived change; a failed archive SHALL keep them.

#### Scenario: Archive with no lock proceeds

- **WHEN** no apply lock names another identity and the change is otherwise ready to archive
- **THEN** `openspec_archive` proceeds and writes no lock

#### Scenario: Archive releases its locks

- **WHEN** `openspec_archive` archives the change named by both locks
- **THEN** both lock files are removed after the archive succeeds

#### Scenario: Archive with one lock present proceeds

- **WHEN** only one of the change's locks is present and it names the change
- **THEN** `openspec_archive` proceeds and releases that lock

#### Scenario: Failed archive keeps the locks

- **WHEN** `openspec_archive` fails for the change named by the locks
- **THEN** the locks remain

#### Scenario: Archive of another change is refused

- **WHEN** `openspec_archive` runs for a change that any present lock names differently
- **THEN** the call fails and no file moves

### Requirement: A stale or paused lock can be released

A lock SHALL be stale when its recorded change root no longer exists, or when its recorded implementation root no longer exists. A user MAY release a paused change's locks by removing every file named in the refusal; the agent SHALL ask the user and SHALL NOT remove it.

#### Scenario: A vanished implementation project is stale

- **WHEN** a store lock records an implementation root that no longer exists
- **THEN** the next project may replace the stale store lock

#### Scenario: Stale lock is replaceable

- **WHEN** a lock records a change root that no longer exists
- **THEN** the next change may acquire it and replace the stale record

#### Scenario: Manual release is a user action

- **WHEN** the user removes every lock file named in the refusal for a paused change
- **THEN** the next apply entry acquires fresh locks
- **AND** the lock refusal tells the agent to ask the user instead of removing the files

### Requirement: Reviews have no round cap

Draft and apply reviews SHALL accept every round for as long as a report and its dispositions are complete. A review SHALL NOT refuse `resume` because a configured round cap was reached. The plugin SHALL NOT store a round cap in the policy, in a record's limits, or in the tool arguments. A legacy policy or record that still carries `maxRounds` SHALL keep the field and SHALL ignore it.

#### Scenario: A fourth round resumes

- **WHEN** a review has already recorded three reports and every finding is disposed
- **THEN** `resume` opens the next round

#### Scenario: A legacy round cap is ignored

- **WHEN** an existing record carries `limits.maxRounds` below the current round count
- **THEN** `resume` opens the next round and the field is not re-read

#### Scenario: No round cap is recorded

- **WHEN** a new review starts
- **THEN** its recorded limits carry the wait limit and no round cap

### Requirement: Extend changes the wait limit

`openspec_review` with `action: "extend"` SHALL accept only a positive minute extension. It SHALL require `approvedBy: "user"` and a reason, record the extension, and never change the locked policy. A `maxRounds` argument SHALL be refused by the tool's parameter schema.

#### Scenario: Wait is extended

- **WHEN** the user approves a 15 minute extension
- **THEN** the current round's deadline moves and the extension is recorded

#### Scenario: A round cap is refused

- **WHEN** a caller passes `maxRounds` to `extend`
- **THEN** the parameter schema rejects the call before execution

### Requirement: Resume requires every finding disposed

`openspec_review` with `action: "resume"` SHALL NOT open a new round while any recorded finding is still `open`. The refusal SHALL name every open finding id and the `action=dispose` step, and SHALL NOT record a round, change the object hash or wake a reviewer. The gate SHALL apply to draft and apply reviews and to both reviewer modes.

#### Scenario: An undisposed draft finding blocks the next round

- **WHEN** the latest draft round has a report and a recorded finding is still `open`
- **THEN** the call fails and names every open finding id
- **AND** it names `openspec_review` with `action: "dispose"`
- **AND** no new round is recorded and no reviewer is woken

#### Scenario: An undisposed apply finding blocks the next round

- **WHEN** the latest apply round has a report and a recorded finding is still `open`
- **THEN** the call fails and names every open finding id
- **AND** no new round is recorded

#### Scenario: Disposal clears the gate

- **WHEN** every recorded finding has been disposed after the latest report
- **THEN** `resume` opens the next round

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

### Requirement: Dispositions name their review kind

`openspec_review` with `action: "dispose"` or a finding `action: "waive"` SHALL require `review: "draft"` or `review: "apply"`. A call that omits `review` SHALL fail before any review record is read or written, and the error SHALL name the parameter and both accepted values. The plugin SHALL NOT treat an absent `review` as `draft` for these two actions.

#### Scenario: A disposition without a kind is refused

- **WHEN** `action: "dispose"` is called without `review`
- **THEN** the call fails before any record is read
- **AND** the error names `review` with `draft` and `apply`
- **AND** neither review record changes

#### Scenario: A draft batch names its record

- **WHEN** `action: "dispose"` is called with `review: "draft"` and a valid batch
- **THEN** the draft findings are disposed
- **AND** the apply record is unchanged

#### Scenario: An apply batch names its record

- **WHEN** `action: "dispose"` is called with `review: "apply"` and a valid batch
- **THEN** the apply findings are disposed
- **AND** the draft record is unchanged

#### Scenario: A finding waiver requires the kind

- **WHEN** `action: "waive"` without `scope: "plan-change"` is called without `review`
- **THEN** the call fails and names the parameter
- **AND** the finding keeps its status

### Requirement: A started apply freezes draft dispositions

Once apply started, a draft `dispose` or a draft finding `waive` SHALL fail and leave the draft record unchanged, and the error SHALL name the apply review status. Apply dispositions and the plan-change `waive` SHALL keep their behavior; the existing draft freeze on `start` and `resume` stays as it is.

#### Scenario: Draft dispose after apply started is refused

- **WHEN** apply started and `action: "dispose"` with `review: "draft"` is called
- **THEN** the call fails and names the apply review status
- **AND** every draft finding keeps its status and verification round

#### Scenario: Draft finding waiver after apply started is refused

- **WHEN** apply started and a draft finding `action: "waive"` is called
- **THEN** the call fails
- **AND** the draft finding is not waived

#### Scenario: Apply dispose still writes

- **WHEN** apply started and `action: "dispose"` with `review: "apply"` is called with a valid batch
- **THEN** the apply findings are disposed

#### Scenario: The plan-change waiver still records

- **WHEN** apply started and `action: "waive"` with `scope: "plan-change"` and `files` is called with user approval
- **THEN** the waiver is recorded in the review directory

### Requirement: Draft review gates requirement description growth

The draft review SHALL check every delta requirement description against the 500-character limit at start and resume, and record the result. It SHALL block when an ADDED description exceeds the limit, or a MODIFIED description exceeds the limit and is longer than its main-spec baseline. The same check SHALL run at the first apply entry before apply starts and before an apply review round opens. An unchanged or shortened legacy description SHALL NOT block.

#### Scenario: An ADDED description exceeds the limit

- **WHEN** a draft review starts for a change whose ADDED description exceeds 500 characters
- **THEN** the round opens
- **AND** the brief lists the requirement, its length and the official handling
- **AND** the draft review is not ready

#### Scenario: A MODIFIED description grows past the limit

- **WHEN** a MODIFIED description exceeds 500 characters and is longer than the main-spec requirement it replaces
- **THEN** the brief lists the current and baseline lengths
- **AND** the draft review is not ready

#### Scenario: A legacy overlong description is unchanged or shortened

- **WHEN** a MODIFIED description exceeds 500 characters and is not longer than its baseline
- **THEN** the gate records no blocking issue
- **AND** the review may be ready after a passing report

#### Scenario: A later round clears the growth

- **WHEN** the author changes the artifacts and resumes the review
- **THEN** the gate rechecks the current artifacts
- **AND** a cleared result no longer blocks readiness

#### Scenario: A rename supplies the baseline

- **WHEN** a MODIFIED requirement is renamed in the same change
- **THEN** the gate follows the rename to the main-spec baseline before comparing lengths

#### Scenario: The first apply entry rechecks the current baseline

- **WHEN** the first `openspec_apply_next` runs after the draft review, before apply starts
- **THEN** it rechecks the delta against the current main specs before the readiness gate
- **AND** it refuses when a blocking result is present

#### Scenario: Apply review rechecks the committed plan

- **WHEN** an apply review starts or resumes after a plan edit
- **THEN** the length gate runs before the round opens
- **AND** a blocking result refuses the round

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

### Requirement: Review briefs carry the report contract

The draft and apply briefs SHALL render one report contract as their whole `## Report` block for the current round. It SHALL name the report fields and required finding fields including `title`, list the verdict, severity and verification-status enums, show a finding id example for the round, state that verifications name only findings recorded before the round, and state that a first round carries none. It SHALL mark impact, rule and failure as required only for critical and major findings.

#### Scenario: First apply round

- **WHEN** the apply brief is built for round 1 with no recorded findings
- **THEN** it states the finding id rule `R<round>-NN` and shows `R1-01` as the finding example
- **AND** its `verifications` example is an empty array with no finding id
- **AND** it states that the first round has no verifications to submit
- **AND** it lists `title` among the finding fields

#### Scenario: Later draft round

- **WHEN** the draft brief is built for round 2 with no recorded findings
- **THEN** the finding id example is `R2-01`, not `R1-01`
- **AND** it contains no verification example id

#### Scenario: Verifications name earlier findings

- **WHEN** the apply brief is built for a round that starts with recorded finding `R1-01` in status `fixed`
- **THEN** it states that verifications name findings recorded before the round, with `R1-01` as the example

#### Scenario: Conditional finding fields

- **WHEN** either brief is read
- **THEN** it marks impact, rule and failure as required only for critical and major findings

### Requirement: The report contract maps the brief axes to report values

The report contract SHALL list the report axis enum and state that a finding's axis is one of those values, while the brief's `## Axes` headings are review prompts, not report values.

#### Scenario: Axis values

- **WHEN** the reviewer reads either brief's contract
- **THEN** it states that a finding's axis is one of the listed enum values
- **AND** it states that the brief's Axes headings are review prompts, not report values

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
- **THEN** the review opens and the base falls back to `git merge-base HEAD origin/main`

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

### Requirement: Git review records are shared across worktrees

The plugin SHALL store review records for a git project at `<git common dir>/openspec-flow/review/<store>#<change>/`, using `local#<change>` when no store is selected. A nested OpenSpec root SHALL append a stable suffix to the record name. The shared root SHALL skip the worktree ignore check.

#### Scenario: A git project uses the shared root

- **WHEN** a review starts for a change in a git project
- **THEN** the plugin writes the record under `<git common dir>/openspec-flow/review/<store>#<change>/`

#### Scenario: The shared root skips the worktree ignore check

- **WHEN** a review starts for a change in a git project
- **THEN** the plugin neither writes `openspec/.gitignore` nor runs the git check-ignore gate for the shared record

#### Scenario: Linked worktrees share one record

- **WHEN** the main worktree and a linked worktree resolve the same change's review record
- **THEN** both resolve the same directory under the git common directory

#### Scenario: A nested root gets a distinct record

- **WHEN** two nested OpenSpec roots of one repository define a change with the same name
- **THEN** their record names differ by the stable nested-root suffix

### Requirement: A legacy review record is copied once

The plugin SHALL copy a legacy review record to the shared root once when neither a shared record nor a migration marker exists, write a marker, and SHALL NOT restore a shared record the user removed. The legacy copy SHALL remain.

#### Scenario: A legacy record is copied once

- **WHEN** the shared root has no record for a change, the legacy root has one, and no migration marker exists
- **THEN** the plugin copies the legacy record to the shared root and writes a migration marker

#### Scenario: A removed shared record stays removed

- **WHEN** a shared record was migrated and the user removes it to restart the review
- **THEN** the next access does not copy the retained legacy record back

#### Scenario: The legacy copy remains

- **WHEN** the plugin copies a legacy record to the shared root
- **THEN** the legacy directory and its files remain in place
