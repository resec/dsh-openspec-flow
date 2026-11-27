# change-review Specification

## Purpose
Defines the change-scoped review record and the draft review that runs before apply. It owns policy locking, the artifact-based review object, self-review reports, findings, readiness and the apply gate.

## Requirements

### Requirement: Review policy is locked when a change is created

The plugin SHALL resolve and write the review policy before `openspec_new_change` creates a change, from the project review file, unless `reviewEnabled` is false. The policy SHALL carry every declared entry's object, switch, reviewer count, wait cap and reviewer model, plus the pipeline. A file change made after the policy is written SHALL NOT alter that change's review behavior. A failed policy write SHALL leave no change directory.

#### Scenario: A new change locks its policy

- **WHEN** the user creates a change in a project whose review file is valid
- **THEN** the change's review directory contains `policy.json` with every entry's resolved settings and the pipeline
- **AND** a later file edit does not alter that file

#### Scenario: An extra entry is locked

- **WHEN** the review file declares a `pr` entry and the user creates a change
- **THEN** the policy carries the `pr` entry, its object and its review parameters

#### Scenario: Policy write fails

- **WHEN** the plugin cannot write the policy file
- **THEN** `openspec_new_change` fails and creates no change directory

#### Scenario: A change created outside the tool is locked on first start

- **WHEN** a change has no policy and the first `openspec_review` start runs
- **THEN** the plugin writes the policy from the project review file and continues

#### Scenario: The review switch is off

- **WHEN** `reviewEnabled` is false and a change is created
- **THEN** no policy is written

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

A review entry whose profile object is `directory` SHALL bind the contents of `proposal.md`, `specs/**`, `design.md`, `tasks.md`, `.openspec.yaml` and the intent text into one `changeHash`. It SHALL NOT require git, a commit or a clean tree. Any change to one of those inputs SHALL invalidate the recorded hash.

#### Scenario: Start records the artifact hash

- **WHEN** a directory entry starts for a change with all required artifacts
- **THEN** the record contains `objectKind: "change"` and a `changeHash`
- **AND** the intent text is stored and hashed

#### Scenario: Artifacts change after the review

- **WHEN** an artifact's bytes differ from the recorded hash
- **THEN** the review is not ready and the tool names the stale object

#### Scenario: Project has no git

- **WHEN** a directory entry starts outside a git repository
- **THEN** the review still starts and records the artifact hash

### Requirement: Draft review validates artifacts before starting

`openspec_review` with `action: "start"` for a directory entry SHALL require that no record exists for that entry, the change artifacts, an intent string and a passing `openspec validate` result. It SHALL reject a change whose planning artifacts are incomplete or invalid. When that entry's record already exists, it SHALL refuse the start and name `openspec_review` with `action: "resume"`.

#### Scenario: Artifacts are valid

- **WHEN** the change has a valid proposal, specs, design, tasks and intent and a directory entry starts
- **THEN** the start returns a review id, round and artifact hash

#### Scenario: Validation fails

- **WHEN** the bundled validator reports a finding for the change
- **THEN** the start fails and returns the validator findings

#### Scenario: Intent is missing

- **WHEN** the start is called without an intent string
- **THEN** the start fails and asks for the user's goal and acceptance conditions

#### Scenario: The draft review already started

- **WHEN** a directory entry's record exists and `start` is called again
- **THEN** the call fails, names `openspec_review` with `action: "resume"` and leaves `intent.md` unchanged

### Requirement: Self-review writes the draft report

With `reviewers: 0`, `openspec_review` with `action: "self-report"` SHALL accept one report from the changer and write it as the round report. It SHALL reject a report with empty required fields, an unknown verdict, severity or axis, a mismatched finding id, a critical or major finding without impact, rule or failure, or a contradictory verdict; text length and entry count SHALL NOT affect validity. After a report is accepted, it SHALL reject a second report for the same round.

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

#### Scenario: A minor finding needs no impact

- **WHEN** a report carries a `minor` finding without `impact`, `rule` or `failure`
- **THEN** the report is accepted when the rest is valid

### Requirement: Draft findings carry severity and a lifecycle

Every finding SHALL carry an id matching `R<round>-NN` or `E<n>-NN`, a severity (critical, major, minor or nit), an axis, location, problem, evidence and suggestion. Critical and major findings SHALL carry impact, rule and failure. Findings SHALL move through open, fixed, verified, verified-deferred, verified-rejected, deferred, rejected and waived.

#### Scenario: Critical finding lacks required evidence

- **WHEN** a report contains a critical finding without impact, rule or failure
- **THEN** the report is rejected

#### Scenario: Blocker is deferred

- **WHEN** a caller tries to defer a finding whose severity is at or above the profile's `passCriteria`
- **THEN** the disposition is rejected

#### Scenario: Fixed finding is verified

- **WHEN** a later report returns a verification with status `verified-fixed` for a fixed finding
- **THEN** the finding becomes `verified` and records the verification round and time

#### Scenario: A deferred finding is verified deferred

- **WHEN** a later report returns a verification with status `verified-deferred` for a recorded `deferred` finding
- **THEN** the finding becomes `verified-deferred` and records the verification round and time

#### Scenario: A rejected finding is verified rejected

- **WHEN** a later report returns a verification with status `verified-rejected` for a recorded `rejected` finding
- **THEN** the finding becomes `verified-rejected` and records the verification round and time

#### Scenario: A disagreed deferred finding returns to open

- **WHEN** a later report returns `still-open` for a recorded `deferred` finding
- **THEN** the finding becomes `open` and records the verification outcome

#### Scenario: A regressed terminal finding returns to open

- **WHEN** a later report returns `regressed` for a `verified`, `verified-deferred` or `verified-rejected` finding
- **THEN** the finding becomes `open` and records the verification outcome

### Requirement: Apply base is recorded when draft review is ready

When `openspec_apply_next` proceeds in a git repository, the plugin SHALL record the seal commit as the apply base commit on the `pipeline.beforeApply` entry's record. The commit SHALL change at least one file inside the change directory and nothing outside it except the change's OpenSpec root `.gitignore` and other `openspec/changes/**` paths, and its change artifacts SHALL match that entry's record. No base is recorded without git or for a store-backed change outside the project root.

#### Scenario: Git project records the base

- **WHEN** a ready `beforeApply` review is followed by `openspec_apply_next` in a git project without the apply worktree and the seal commit is present
- **THEN** that entry's record gains the commit as the apply base commit

#### Scenario: Non-git project has no base

- **WHEN** the project has no git repository
- **THEN** no record carries an apply base and tree entries remain unavailable

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

A review entry whose profile object is `tree` SHALL bind the git tree of the current `HEAD` commit. It SHALL require a git repository, a resolved commit and a working tree that is clean except for uncommitted paths under other `openspec/changes/**` directories. A project without git SHALL NOT offer a tree entry. Any other working-tree change after start SHALL invalidate the review, and a tree change SHALL invalidate it.

#### Scenario: Apply review starts on a clean commit

- **WHEN** a change has a clean working tree and a commit and a tree entry starts
- **THEN** the entry records the commit and tree hashes
- **AND** the base is the beforeApply entry's apply base commit, an explicit `base` passed to the round, or `git merge-base HEAD origin/main`

#### Scenario: Working tree is dirty

- **WHEN** a tree entry starts with uncommitted changes outside other `openspec/changes/**` directories
- **THEN** the start fails and asks for a commit

#### Scenario: Another change's uncommitted artifacts are allowed

- **WHEN** a tree entry starts while only other `openspec/changes/**` directories have uncommitted files
- **THEN** the start proceeds and records the tree

#### Scenario: Project has no git

- **WHEN** a tree entry is requested outside a git repository
- **THEN** the start fails and reports that the entry is unavailable

#### Scenario: Tree changes after start

- **WHEN** `HEAD` resolves to another tree than the one recorded
- **THEN** the review is not ready and the gate refuses archive

### Requirement: Apply review binds the reviewed draft artifacts

A tree entry SHALL NOT refuse a start or resume when the change artifacts inside the current tree differ from the `beforeApply` entry's recorded artifact hash. It SHALL record the draft hash, current hash and changed artifact paths in the tree record and list them in the brief for the plan axes.

#### Scenario: Applied tree matches the draft

- **WHEN** the current change artifacts equal the `beforeApply` entry's artifact hash
- **THEN** the tree entry may start or resume

#### Scenario: Applied tree changed the plan

- **WHEN** an artifact differs from the `beforeApply` hash and the file is inside the waiver file set
- **THEN** the tree entry start or resume opens a round
- **AND** the brief lists the changed artifacts on the plan axes

### Requirement: Apply review uses the draft base and report lifecycle

A tree entry SHALL reuse the directory entry's report, finding, severity and readiness contract. It SHALL record its own rounds and findings, and its `ready` result SHALL require a passing latest report, no open blocking finding, a matching `treeSha`, and every drift file waived. Its default draft baseline SHALL be the record of the `pipeline.beforeApply` entry. While `rebaseReview` is present, the matching tree SHALL be the latest extra round's tree.

#### Scenario: Apply review passes

- **WHEN** the latest tree report passes, no blocker is open, the tree matches and every drift file is waived
- **THEN** the tree entry is ready

#### Scenario: Apply review finds a blocker

- **WHEN** the latest report carries an unresolved finding at or above `passCriteria`
- **THEN** the entry is not ready and its gate refuses the lifecycle step

#### Scenario: Apply review starts from the seal commit

- **WHEN** the first tree round opens after a git seal and no explicit base is passed
- **THEN** its base is the beforeApply entry's apply base commit, or the current fork when the branch already took in newer main
- **AND** the diff covers the implementation and any plan change after the seal

#### Scenario: A pr entry uses the beforeApply baseline

- **WHEN** a `pr` tree entry starts without `baseline` and the `beforeApply` entry has a ready record
- **THEN** the `pr` entry records the draft baseline and reads that record

#### Scenario: An extra round owns the ready tree

- **WHEN** the marker is present and the latest extra round passes
- **THEN** readiness compares the tree against that extra round's `treeSha`

### Requirement: Apply review is gated by its own policy

Every entry SHALL be enabled and limited by its own locked policy section. A tree entry SHALL be unavailable when its section is disabled or the project has no git. When the project has no git repository, policy creation SHALL lock every tree entry disabled even when the project review file enables it.

#### Scenario: Policy disables apply review

- **WHEN** the change policy disables a tree entry
- **THEN** the lifecycle step that names it does not require that entry

#### Scenario: Policy locks apply review settings

- **WHEN** a change is created with an entry whose profile enables the review
- **THEN** a later file edit does not alter that entry's review

#### Scenario: Project has no git at creation

- **WHEN** a change is created in a project without a git repository and the file enables a tree entry
- **THEN** the locked policy has that entry's `enabled` false and `git.enabled` false
- **AND** the tree entry remains unavailable for that change

#### Scenario: Legacy no-git policy stays enabled in the record

- **WHEN** a policy written before this change enables the apply entry in a project without git
- **THEN** the policy still records that entry enabled
- **AND** the entry is unavailable and its gate does not hold archive

### Requirement: One independent reviewer can run either review

The plugin SHALL accept `reviewers: 1` for every entry. It SHALL start exactly one reviewer through a managed activation with caller delivery and the `openspec-reviewer` preset. It SHALL record the slot, child id and activation state.

#### Scenario: Draft review starts a reviewer

- **WHEN** a directory entry starts with `reviewers: 1`
- **THEN** one reviewer activation starts and the record names its child id and slot

#### Scenario: Apply review starts a reviewer

- **WHEN** an apply tree entry starts with `reviewers: 1`
- **THEN** one reviewer activation starts against the committed tree

#### Scenario: A pr entry starts a reviewer

- **WHEN** a `pr` tree entry starts with `reviewers: 1`
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

A record with a user-waived reviewer SHALL skip the missing-report requirement but SHALL still require the artifact or tree hash, every finding at or above the pass criteria resolved or user-waived, and a passing verdict from the remaining review content. A below-threshold finding SHALL NOT block readiness.

#### Scenario: Waived reviewer with no findings

- **WHEN** the reviewer is waived and no finding is open
- **THEN** readiness may pass with `coverageGap`

#### Scenario: Waived reviewer with an open blocker

- **WHEN** an unresolved finding at or above `passCriteria` exists
- **THEN** readiness still fails

#### Scenario: Waived reviewer with only a below-threshold finding

- **WHEN** the reviewer is waived and the only open finding is below `passCriteria`
- **THEN** readiness may pass with `coverageGap`

### Requirement: The reviewer model is locked per change

The policy SHALL carry one concrete reviewer model for every entry. `source: "inherit"` SHALL resolve to the changer's current provider, model and effort when the policy is locked; an unresolvable inherit SHALL fail the policy write. The concrete model MAY omit `reasoningEffort` when that model exposes no selectable effort, and the reviewer then follows the adapter default. The policy SHALL NOT change when the project review file is edited later.

#### Scenario: Inherit resolves at lock time

- **WHEN** a new change locks an entry whose profile carries `source: "inherit"`
- **THEN** the policy contains that entry's resolved provider, model and effort

#### Scenario: Inherit cannot resolve

- **WHEN** the changer has no current model at lock time
- **THEN** the change is not created

#### Scenario: The page edits defaults after locking

- **WHEN** the project review file changes a reviewer model after a change is locked
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

For a change with `reviewers: 1`, resuming into a new round of any entry SHALL wake that entry's existing reviewer to read the new brief; it SHALL NOT start another reviewer. Resuming an unreported draft round SHALL NOT wake it again while its object is unchanged; refreshing a blocked draft round SHALL wake the reviewer for the same round. The slot SHALL keep the same agent and record the round it was woken for. `replace` remains the only way to start a new reviewer.

#### Scenario: A new draft round wakes the same reviewer

- **WHEN** the latest draft round has a report and `resume` opens the next draft round
- **THEN** a wake message is sent to the slot reviewer, the slot keeps its agent id and records the new round
- **AND** no new reviewer activation starts

#### Scenario: A new apply round wakes the same reviewer

- **WHEN** the latest apply round has a report and `resume` opens the next apply round
- **THEN** a wake message is sent to the slot reviewer, the slot keeps its agent id and records the new round
- **AND** no new reviewer activation starts

#### Scenario: A new pr round wakes the same reviewer

- **WHEN** the latest `pr` round has a report and `resume` opens the next `pr` round
- **THEN** a wake message is sent to the slot reviewer, the slot keeps its agent id and records the new round
- **AND** the message names the `pr` entry

#### Scenario: Resuming an unreported round does not wake again

- **WHEN** the latest round has no report and `resume` reuses it
- **THEN** no wake message is sent and the slot keeps its agent

#### Scenario: Refreshing a blocked round wakes the same reviewer

- **WHEN** the latest draft attempt carries a blocked report and `resume` archives it and refreshes the same round
- **THEN** a wake message is sent to the slot reviewer with the unchanged round number
- **AND** no new reviewer activation starts

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

`openspec_review` with `action: "start"` or `"resume"` for a tree entry SHALL run `openspec validate` with the strict option for the committed change before opening the round. It SHALL refuse the round when validation reports an issue, naming each issue, and SHALL NOT create or advance a round. The tree brief SHALL carry the host's validation result so the reviewer does not run validation itself.

#### Scenario: Apply review starts after a strict pass

- **WHEN** the committed change passes `openspec validate --strict`
- **THEN** the tree entry start opens a round and the brief records the strict pass

#### Scenario: Strict validation reports a warning

- **WHEN** the committed change has a strict-only warning
- **THEN** the tree entry start or resume fails and names the issue
- **AND** no round is opened

#### Scenario: Reviewer reads the validation result

- **WHEN** the reviewer reads the tree brief
- **THEN** the brief states the host validated the tree strictly and the reviewer is not expected to run validation

### Requirement: Git projects seal the draft before apply

Without the apply worktree, a git project's first `openspec_apply_next` SHALL require a clean tree, a `HEAD` that changes only the change directory, the root `.gitignore` and other `openspec/changes/**` paths, and matching artifacts. It SHALL record `HEAD` as the apply base. Other changes' uncommitted files are ignored; paths compare worktree-relative. A git worktree apply seals on the branch instead. Without git or an outside-root store change, the checks are skipped; the store change warns.

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

`openspec_review` with `action: "waive"` and `scope: "plan-change"` SHALL require that apply started, a non-empty `waiver`, `approvedBy: "user"` and an explicit `files` list, and SHALL record the waiver in the review directory. Apply has started when the `beforeApply` record carries an apply base commit or any tree entry record exists. Repeated waivers SHALL merge their file sets.

#### Scenario: Waiver is recorded

- **WHEN** apply started, the user approves a plan change, and the changer calls `waive` with `scope: "plan-change"`, the approval text and the changed files
- **THEN** the review directory carries the waiver text, approver, time and file list
- **AND** the tree entry's brief shows the waiver

#### Scenario: Waiver before apply started is refused

- **WHEN** `waive` with `scope: "plan-change"` runs before apply started
- **THEN** the call fails and asks for a resumed draft review instead

#### Scenario: Waiver is available before the first apply review round

- **WHEN** a task changes an artifact during the apply loop and the user approves the change
- **THEN** `waive` records the waiver without an existing apply review record
- **AND** the first tree entry start accepts the drift

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

When a report carries a verification status that does not match the recorded finding, the plugin SHALL refuse the report and report the current status plus the disposition step that clears it: `verified-fixed` needs `fixed`, `verified-deferred` needs `deferred`, and `verified-rejected` needs `rejected`. A finding already `verified`, `verified-deferred`, `verified-rejected` or `waived` SHALL be reported as closed without directing another disposal.

#### Scenario: An open finding cannot be verified fixed

- **WHEN** a report verifies `R1-01` as `verified-fixed` and the recorded finding is still `open`
- **THEN** the report is refused
- **AND** the error names `open`, `action=dispose`, the review kind and `status=fixed`

#### Scenario: A deferred finding cannot be verified fixed

- **WHEN** a report verifies a finding as `verified-fixed` and the recorded finding is `deferred`
- **THEN** the report is refused and the error names `deferred`

#### Scenario: A rejected finding cannot be verified deferred

- **WHEN** a report verifies a finding as `verified-deferred` and the recorded finding is `rejected`
- **THEN** the report is refused and the error names `rejected`

#### Scenario: A fixed finding cannot be verified rejected

- **WHEN** a report verifies a finding as `verified-rejected` and the recorded finding is `fixed`
- **THEN** the report is refused and the error names `fixed`

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

A git worktree apply SHALL keep the per-change change lock for its implementation domain and SHALL also keep the store-domain apply lock for a store-backed change. Other paths SHALL keep the project apply locks. Locks SHALL name the review key; a store lock SHALL record the implementation root so a second project is refused. Every apply entry SHALL acquire the applicable lock; a foreign lock SHALL refuse and name the holder and path. Draft review SHALL remain available.

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

The applicable lock SHALL be enforced regardless of git, store selection, the draft switch or a policy. Git worktree apply SHALL use the per-change change lock and keep the store-domain lock when selected; compatibility and non-git paths SHALL use the project lock. A project lock SHALL record a schema version, the change, store, change root, implementation root and start time.

#### Scenario: A draft-disabled change takes the lock

- **WHEN** a change whose policy disables draft review calls `openspec_apply_next`
- **THEN** it acquires the lock before apply proceeds

#### Scenario: A non-git project serializes apply

- **WHEN** a second change in a project without git calls `openspec_apply_next` while the lock names the first change
- **THEN** the second call fails and names the holder

### Requirement: The apply lock covers the implementation and store domains

A git worktree apply SHALL use the per-change change lock instead of the implementation-domain project lock, and a store-backed change SHALL also acquire the store domain. Other paths SHALL acquire the implementation-domain project lock: the session's git worktree root, else the nearest OpenSpec root at or above the session working directory, else the change's resolved root. A git domain SHALL use its worktree git directory; any other domain SHALL use `openspec/.review/`.

#### Scenario: A store change and a local change share one project lock

- **WHEN** a store change and a local change in one project both call an apply entry
- **THEN** the local worktree change uses its per-change lock while the store change also uses the store lock

#### Scenario: Two store changes from different stores serialize in one project

- **WHEN** two store changes from different stores are applied from one project
- **THEN** both take their own per-change locks and also contend on the store lock when selected

#### Scenario: A store-backed change takes the store domain lock

- **WHEN** one store change is applied from two projects
- **THEN** both sessions also use the store domain's lock and only one proceeds

#### Scenario: Nested roots share one worktree lock

- **WHEN** two changes live under different OpenSpec roots inside one git worktree
- **THEN** the per-change change lock is shared through the git common directory

#### Scenario: Linked worktrees take separate locks

- **WHEN** two linked worktrees of one repository apply changes
- **THEN** the per-change change lock is shared through the git common directory

#### Scenario: Git domain lock leaves the tree clean

- **WHEN** a change inside a git worktree acquires its implementation lock
- **THEN** `git status --porcelain` reports no new path

#### Scenario: A session outside every root falls back

- **WHEN** a change is applied from a directory with no OpenSpec root above it and no git worktree
- **THEN** its implementation lock is written under the change's resolved root

### Requirement: Another change's uncommitted planning files do not block the lock holder

While a change holds its apply locks, the seal, apply review and archive checks SHALL ignore uncommitted paths under other `openspec/changes/` directories, on worktree-relative paths. The git worktree seal SHALL also ignore the reviewed change's own directory and the plugin-written ignore file. Every other path, including the reviewed change's own directory for the worktree-disabled seal, apply review and archive, SHALL count as dirty.

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

- **WHEN** the working tree has an uncommitted code path outside `openspec/changes/` and other than the plugin-written ignore file
- **THEN** the seal, apply review and archive still refuse

#### Scenario: The git worktree seal accepts its own copy

- **WHEN** a git worktree apply seals with the change directory and the plugin-written ignore file uncommitted
- **THEN** the clean-tree check passes

#### Scenario: The worktree-disabled seal refuses its own copy

- **WHEN** the worktree is disabled and the change directory is uncommitted before the seal
- **THEN** the seal refuses and asks for a commit

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

The apply review brief SHALL name the base reference and identify its source as the seal commit recorded by the first `openspec_apply_next`, an explicit base passed to the round, `git merge-base HEAD origin/main`, or the current fork after the branch took in newer main.

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

#### Scenario: The base is the re-based fork

- **WHEN** the round re-bases its diff origin after the branch took in newer main
- **THEN** the brief names the current fork as the base reference
- **AND** the brief states the branch was rebased or merged onto newer main and names the original base as `rebasedFrom`

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

`openspec_review` with `action: "dispose"` or a finding `action: "waive"` SHALL require `review` naming one of the change's configured entries. A call that omits `review` SHALL fail before any review record is read or written, and the error SHALL name the parameter and the configured entry names. The plugin SHALL NOT treat an absent `review` as `draft` for these two actions.

#### Scenario: A disposition without a kind is refused

- **WHEN** `action: "dispose"` is called without `review`
- **THEN** the call fails before any record is read
- **AND** the error names `review` and the configured entry names
- **AND** no review record changes

#### Scenario: A draft batch names its record

- **WHEN** `action: "dispose"` is called with `review: "draft"` and a valid batch
- **THEN** the draft findings are disposed
- **AND** the apply record is unchanged

#### Scenario: An apply batch names its record

- **WHEN** `action: "dispose"` is called with `review: "apply"` and a valid batch
- **THEN** the apply findings are disposed
- **AND** the draft record is unchanged

#### Scenario: A pr batch names its record

- **WHEN** `action: "dispose"` is called with `review: "pr"` and a valid batch
- **THEN** the `pr` findings are disposed
- **AND** the draft and apply records are unchanged

#### Scenario: A finding waiver requires the kind

- **WHEN** `action: "waive"` without `scope: "plan-change"` is called without `review`
- **THEN** the call fails and names the parameter
- **AND** the finding keeps its status

### Requirement: A started apply freezes draft dispositions

Once apply started, a `dispose` or a finding `waive` on the `beforeApply` entry SHALL fail and leave that record unchanged, and the error SHALL name the tree entry status. Tree dispositions and the plan-change `waive` SHALL keep their behavior; the existing draft freeze on `start` and `resume` stays as it is.

#### Scenario: Draft dispose after apply started is refused

- **WHEN** apply started and `action: "dispose"` with `review: "draft"` is called
- **THEN** the call fails and names the tree entry status
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

Every directory entry's review SHALL check every delta requirement description against the 500-character limit at start and resume, and record the result. It SHALL block when an ADDED description exceeds the limit, or a MODIFIED description exceeds the limit and is longer than its main-spec baseline. The same check SHALL run at the first apply entry before apply starts and before a tree entry round opens. An unchanged or shortened legacy description SHALL NOT block.

#### Scenario: An ADDED description exceeds the limit

- **WHEN** a directory entry starts for a change whose ADDED description exceeds 500 characters
- **THEN** the round opens
- **AND** the brief lists the requirement, its length and the official handling
- **AND** the entry is not ready

#### Scenario: A MODIFIED description grows past the limit

- **WHEN** a MODIFIED description exceeds 500 characters and is longer than the main-spec requirement it replaces
- **THEN** the brief lists the current and baseline lengths
- **AND** the entry is not ready

#### Scenario: A legacy overlong description is unchanged or shortened

- **WHEN** a MODIFIED description exceeds 500 characters and is not longer than its baseline
- **THEN** the gate records no blocking issue
- **AND** the entry may be ready after a passing report

#### Scenario: A later round clears the growth

- **WHEN** the author changes the artifacts and resumes the entry
- **THEN** the gate rechecks the current artifacts
- **AND** a cleared result no longer blocks readiness

#### Scenario: A rename supplies the baseline

- **WHEN** a MODIFIED requirement is renamed in the same change
- **THEN** the gate follows the rename to the main-spec baseline before comparing lengths

#### Scenario: The first apply entry rechecks the current baseline

- **WHEN** the first `openspec_apply_next` runs after the directory entry, before apply starts
- **THEN** it rechecks the delta against the current main specs before the readiness gate
- **AND** it refuses when a blocking result is present

#### Scenario: Apply review rechecks the committed plan

- **WHEN** a tree entry starts or resumes after a plan edit
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

The draft and apply briefs SHALL render one report contract as their whole `## Report` block for the current round. It SHALL name the report and required finding fields including `title`, list the verdict, severity and verification-status enums, show a finding id example, state the verification candidates and the first-round empty case, mark impact, rule and failure as critical/major-only, and state the pass criteria, disposition switches and verdict rule.

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

#### Scenario: The contract names the new verification statuses

- **WHEN** either brief is read
- **THEN** it lists `verified-fixed`, `still-open`, `regressed`, `verified-deferred` and `verified-rejected` as verification statuses

#### Scenario: The contract states the pass criteria and switches

- **WHEN** either brief is read
- **THEN** it states the profile's `passCriteria` and whether `deferred` and `rejected` dispositions are allowed

#### Scenario: The contract names the verification candidates

- **WHEN** either brief is read
- **THEN** it names `fixed`, `deferred` and `rejected` findings as verification candidates
- **AND** it names `verified-fixed`, `verified-deferred` and `verified-rejected` as their confirmation statuses
- **AND** it names `still-open` as the status that returns a `deferred` or `rejected` finding to `open`

#### Scenario: The contract states the verdict rule

- **WHEN** either brief is read
- **THEN** it states that `pass` cannot introduce an unresolved finding at or above `passCriteria`
- **AND** it states that `changes-requested` needs at least one unresolved finding at or above `passCriteria`

### Requirement: The report contract maps the brief axes to report values

The report contract SHALL list the report axis enum and state that a finding's axis is one of those values, while the brief's `## Axes` headings are review prompts, not report values.

#### Scenario: Axis values

- **WHEN** the reviewer reads either brief's contract
- **THEN** it states that a finding's axis is one of the listed enum values
- **AND** it states that the brief's Axes headings are review prompts, not report values

### Requirement: Standalone apply review has no draft baseline

A tree entry started with `baseline: "none"` SHALL NOT require a `beforeApply` record, intent, plan-drift check or plan-change waiver. When the caller explicitly passes `baseline: "none"`, it SHALL require an explicit base and refuse a change that already has a `beforeApply` record; the record SHALL store `none`. When the `beforeApply` policy is disabled, an omitted baseline SHALL record `none` and keep the existing base fallback; otherwise the default keeps the draft gate.

#### Scenario: A committed branch starts without a draft record

- **WHEN** a change has no `beforeApply` record and a clean committed tree, and the caller starts a tree entry with `baseline: "none"` and an explicit base
- **THEN** the round opens, records the commit, tree and base, and records `baseline: "none"`

#### Scenario: The explicit base owns the diff scope

- **WHEN** a no-draft tree entry starts with a base commit
- **THEN** the brief names that base as the explicit source and the diff starts at its tree

#### Scenario: No base is refused

- **WHEN** a caller explicitly passes `baseline: "none"` without a non-empty base
- **THEN** the call fails before writing a round and asks for `base`

#### Scenario: A draft-disabled omitted baseline keeps the base fallback

- **WHEN** the `beforeApply` entry is disabled, the caller omits `baseline`, and no base is passed
- **THEN** the review opens and the base falls back to `git merge-base HEAD origin/main`

#### Scenario: An existing draft record refuses the no-draft baseline

- **WHEN** a change already has a `beforeApply` record and the caller explicitly starts a tree entry with `baseline: "none"`
- **THEN** the call fails before writing a round and names that record and the plan-change waiver path

#### Scenario: A draft-disabled policy records the none baseline

- **WHEN** a change's policy disables the `beforeApply` entry and the caller starts a tree entry with an omitted baseline
- **THEN** the tree entry opens and records `baseline: "none"`

#### Scenario: Plan drift checks are skipped

- **WHEN** a no-draft tree entry runs after the change artifacts were committed on the branch
- **THEN** the review does not ask for a plan-change waiver and does not report draft drift

#### Scenario: Readiness still requires a report

- **WHEN** a no-draft tree entry opens a round without a report
- **THEN** the entry is not ready and the next action is the report action for its mode

#### Scenario: The default with an enabled draft policy still requires a draft

- **WHEN** the `beforeApply` policy is enabled and a caller starts a tree entry without `baseline` for a change with no draft review record
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

### Requirement: The changer reads the reviewer report without polling

`wait` SHALL NOT poll. It SHALL return `ready` when the latest round has a report or the reviewer is waived, `overdue` at the deadline, and `waiting` otherwise; `waiting` sets `waitState: "waiting"` and ends the turn. The result SHALL come from a post-write read that re-reads inside the lock and changes only `changerSessionId`. The deadline remains `waitMinutes`.

#### Scenario: Reviewer already submitted

- **WHEN** the latest round has a report before `wait` is called
- **THEN** `wait` returns `ready` and the readiness calculation runs

#### Scenario: No report before the deadline

- **WHEN** the latest round has no report and the deadline has not passed
- **THEN** `wait` returns `waiting` and instructs the changer to end its turn

#### Scenario: Deadline has passed

- **WHEN** the wait deadline has passed and no report arrived
- **THEN** the wait returns `overdue`

#### Scenario: Wait does not sleep on a poll interval

- **WHEN** `wait` is called for a pending reviewer
- **THEN** it returns from the post-write read without a poll loop

### Requirement: Land binds a ready apply review to the merged tree

When the `pipeline.beforeArchive` entry is enabled and ready, its recorded tree SHALL equal the worktree `HEAD^{tree}` at land start. A ready extra round named by `rebaseReview` SHALL supply that tree while the marker is present. Land SHALL verify the feature head tree equals that tree before the fast-forward and the main tree equals it after the fast-forward, inside the same lifecycle critical section.

#### Scenario: Land verifies the reviewed tree

- **WHEN** land starts for a ready `beforeArchive` entry
- **THEN** it checks the recorded tree against the worktree head and the main tree after the fast-forward

#### Scenario: A stale reviewed tree is refused

- **WHEN** the worktree head or the main tree after the fast-forward differs from the required tree
- **THEN** land refuses and does not archive

#### Scenario: Archive follows the tree check

- **WHEN** the main tree after the fast-forward matches
- **THEN** archive runs before the lifecycle lock is released

#### Scenario: A ready extra round owns the required tree

- **WHEN** `rebaseReview` is present and the latest extra round is ready
- **THEN** its `treeSha` is the required tree

### Requirement: Land without apply review verifies the worktree head

When the locked policy disables the `beforeArchive` entry or declares none, land SHALL verify the feature head tree before the fast-forward and the main tree after it against the worktree's current `HEAD^{tree}`. An enabled but unready entry SHALL refuse before the fast-forward.

#### Scenario: A disabled review uses the worktree head

- **WHEN** the policy disables the `beforeArchive` entry or declares none
- **THEN** the worktree head is the required tree

#### Scenario: An enabled unready review is refused

- **WHEN** the policy enables the `beforeArchive` entry and no ready review exists
- **THEN** land refuses before the fast-forward

### Requirement: Archive takes the lifecycle lock

In a git project, `openspec_archive` SHALL acquire the lifecycle lock on the main worktree before it checks the apply review or moves the change, and SHALL release it after the archive completes or fails. This serializes a main-worktree archive with land, remove and worktree creation. A project without git SHALL proceed without the lifecycle lock.

#### Scenario: Archive waits for land

- **WHEN** land holds the lifecycle lock
- **THEN** `openspec_archive` waits and does not move the change

#### Scenario: Land waits for archive

- **WHEN** `openspec_archive` holds the lifecycle lock
- **THEN** land does not start its merge

#### Scenario: A non-git archive proceeds

- **WHEN** the project has no git repository
- **THEN** `openspec_archive` proceeds without the lifecycle lock

### Requirement: Land tolerates another change's planning files

The land clean-main check SHALL ignore uncommitted paths under other `openspec/changes/` directories. Before the check it SHALL reconcile the landed change's plugin-owned planning copy: matching untracked files under its directory and the plugin-written root `.gitignore` are removed, and a tracked modified or deleted `.gitignore` is restored to its `HEAD` version. Any other uncommitted file inside the landed change, or a code path, SHALL refuse.

#### Scenario: A parallel draft's planning file is uncommitted

- **WHEN** main has an uncommitted file under another change's directory
- **THEN** land proceeds

#### Scenario: The landed change is dirty

- **WHEN** main has an uncommitted file inside the landed change's directory that differs from the seal tree or is not in it
- **THEN** land refuses

#### Scenario: The matching planning copy is reconciled

- **WHEN** the untracked change directory and an untracked plugin-written ignore file match the seal tree
- **THEN** land removes them and the clean-main check passes

#### Scenario: A tracked modified change-directory file refuses

- **WHEN** main has an uncommitted tracked modification inside the landed change's directory
- **THEN** land refuses and names the path

#### Scenario: A tracked ignore file is restored

- **WHEN** the plugin-written `.gitignore` is tracked and modified or deleted in main
- **THEN** land restores its `HEAD` version before the clean-main check

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

While the marker is present, land SHALL require a ready extra round and SHALL use its `treeSha` as the required tree. Without a ready extra round, land SHALL refuse before the fast-forward and name `openspec_review action=resume review=apply`. The marker SHALL be cleared only after land binds that tree.

#### Scenario: Land uses the ready extra round tree

- **WHEN** the marker is present and the latest extra round is ready
- **THEN** land verifies the worktree head and main tree against that extra round's tree

#### Scenario: Land waits for an extra round

- **WHEN** the marker is present and no extra round is ready
- **THEN** land refuses before the fast-forward and names the resume step

### Requirement: A git worktree apply seals on the apply branch

In a git worktree apply, the first `openspec_apply_next` after a ready draft review SHALL construct the seal commit with a temporary index from the change directory and the plugin-written uncommitted root `.gitignore`, attach it to the apply branch and the seal ref, and record it as the apply base, leaving `main`'s `HEAD`, index and working tree unchanged. The working tree SHALL be clean apart from the change directory, other changes' directories and that ignore file.

#### Scenario: The seal is constructed

- **WHEN** a ready draft review is followed by `openspec_apply_next` in a git worktree apply and the working tree matches the draft
- **THEN** the review record gains the constructed commit as the apply base
- **AND** the change directory stays uncommitted in main
- **AND** main's `HEAD`, index and working tree are unchanged

#### Scenario: The constructed commit changes only the planning paths

- **WHEN** the construction stages the change directory and the plugin-written ignore file
- **THEN** the commit changes at least one file under the change directory
- **AND** it changes no path outside the change directory and that ignore file

#### Scenario: The constructed artifacts match the draft

- **WHEN** the constructed commit's change artifacts are hashed
- **THEN** the hash equals the draft record's artifact hash

#### Scenario: The uncommitted ignore file is accepted

- **WHEN** the plugin wrote `openspec/.gitignore` and it is uncommitted
- **THEN** the clean-tree check accepts it and the construction stages it

#### Scenario: A dirty path outside the allowed set is refused

- **WHEN** a file outside the change directory, other `openspec/changes/**` directories and the plugin-written ignore file has uncommitted changes
- **THEN** `openspec_apply_next` fails and asks for a clean working tree

#### Scenario: Artifact mismatch leaves no seal

- **WHEN** the constructed commit's artifact hash differs from the draft record
- **THEN** `openspec_apply_next` fails, records no base and leaves no seal ref or branch

### Requirement: The recorded apply base survives a rebase

A rebase SHALL replay the branch's seal commit and rewrite it. The plugin SHALL keep the recorded apply base commit reachable through its seal ref, and SHALL NOT record a base commit that no ref keeps reachable. When the branch took in newer main, the round SHALL derive the re-based fork tree again, diff from it, and keep the recorded base as `rebasedFrom`.

#### Scenario: Rebase rewrites the branch seal

- **WHEN** the worktree branch is rebased onto a newer main
- **THEN** the branch's first commit is a rewritten seal commit
- **AND** the recorded base commit is still reachable from the seal ref

#### Scenario: Apply review diffs the recorded base

- **WHEN** an apply review round runs and the seal commit's parent still equals the current fork
- **THEN** its diff starts at the recorded base tree
- **AND** no `rebasedFrom` is recorded

#### Scenario: Apply review diffs the re-based tree

- **WHEN** an apply review round runs after the branch took in newer main
- **THEN** its diff starts at the re-based fork tree
- **AND** the recorded base is stored as `rebasedFrom`

### Requirement: Draft review resolves requirement anchors

At a directory entry's `start` and `resume`, the host SHALL check every MODIFIED and REMOVED requirement name, and every RENAMED `from`, against the current main spec. Pending renames SHALL be followed, so a rename target resolves through its source. A name with no baseline SHALL block, and a delta that anchors to a missing main spec SHALL block. The refusal SHALL name both clearing routes: fix the artifacts and resume, and wait for an adding change to archive and resume.

#### Scenario: A MODIFIED name resolves in the main spec

- **WHEN** a MODIFIED requirement name equals a requirement in its main spec
- **THEN** the preflight records no anchor issue for it

#### Scenario: A missing MODIFIED name blocks

- **WHEN** a MODIFIED requirement name has no match in its main spec
- **THEN** the preflight records a blocking anchor issue
- **AND** the entry is not ready

#### Scenario: A rename target resolves through its source

- **WHEN** a delta renames `Old` to `New` and a MODIFIED requirement is named `New`
- **THEN** the preflight resolves `New` through `Old` and records no anchor issue

#### Scenario: A missing REMOVED name blocks

- **WHEN** a REMOVED requirement name has no match in its main spec
- **THEN** the preflight records a blocking anchor issue

#### Scenario: A missing RENAMED source blocks

- **WHEN** a RENAMED `from` has no match in its main spec
- **THEN** the preflight records a blocking anchor issue

#### Scenario: A missing name names both clearing routes

- **WHEN** a MODIFIED name has no main-spec baseline
- **THEN** the preflight records a blocking anchor issue
- **AND** the refusal names fixing the artifacts and resuming, and waiting for an adding change to archive and resuming

#### Scenario: A missing main spec blocks

- **WHEN** a delta with a MODIFIED, REMOVED or RENAMED requirement has no main spec file
- **THEN** the preflight records a blocking anchor issue for the missing spec

#### Scenario: Editing the artifacts clears the anchor issue

- **WHEN** the author corrects the name and resumes the directory entry
- **THEN** the preflight rechecks the current artifacts
- **AND** a cleared result no longer blocks readiness

### Requirement: Draft review resolves task execution paths

At a directory entry's `start` and `resume`, the host SHALL check every repo-relative `test/` or `scripts/` path named in a backticked code span in `tasks.md`. A path that does not exist at the project root SHALL block unless the task clause that names it declares creating, deleting, renaming or moving it. Globs, placeholders, absolute paths, `..` segments and paths outside `test/` and `scripts/` SHALL be skipped.

#### Scenario: An existing test path passes

- **WHEN** tasks.md names `test/review-draft.test.mjs` and the file exists
- **THEN** the preflight records no path issue for it

#### Scenario: A missing undeclared path blocks

- **WHEN** tasks.md names `test/missing.test.mjs`, the file does not exist and no clause declares creating, deleting, renaming or moving it
- **THEN** the preflight records a blocking path issue with the task line
- **AND** the entry is not ready

#### Scenario: A declared new path passes

- **WHEN** a task says to add `test/new-preflight.test.mjs` and the file does not exist yet
- **THEN** the preflight records no path issue for it

#### Scenario: A declared deletion passes

- **WHEN** a task says to delete `test/legacy.test.mjs` and the file no longer exists
- **THEN** the preflight records no path issue for it

#### Scenario: A glob is skipped

- **WHEN** tasks.md names `test/review-*.test.mjs`
- **THEN** the preflight does not treat it as a missing path

#### Scenario: Editing the task clears the path issue

- **WHEN** the author fixes the path or declares the file and resumes the directory entry
- **THEN** the preflight rechecks the current tasks.md
- **AND** a cleared result no longer blocks readiness

### Requirement: The draft execution preflight is recorded and rechecked

A directory entry's review SHALL record the execution preflight result as an additive field, render it in the brief, and stay not ready while it blocks. The first apply entry before apply starts, and a tree entry `start` or `resume`, SHALL recheck it and refuse on a blocking result. After apply starts, directory readiness SHALL NOT gate on the recorded result; the tree entry owns the recheck. A block with no finding SHALL be cleared by the directory entry's `resume`, not `dispose`.

#### Scenario: A blocking result is recorded and shown

- **WHEN** the preflight finds a missing anchor or an undeclared missing path
- **THEN** the directory entry's record carries the blocking result
- **AND** its brief lists the issue
- **AND** the entry is not ready

#### Scenario: The first apply entry refuses a blocking result

- **WHEN** the first `openspec_apply_next` runs before apply starts and the recheck blocks
- **THEN** the call fails and names the blocking issue and the entry's resume action

#### Scenario: Apply review refuses a blocking result

- **WHEN** a tree entry starts or resumes after a plan edit and the preflight blocks
- **THEN** the call refuses to open the round and names the blocking issue

#### Scenario: A started apply defers to apply review

- **WHEN** apply started and the recorded execution result still blocks
- **THEN** directory readiness does not report it
- **AND** the tree entry rechecks it

#### Scenario: A no-finding block resumes without dispose

- **WHEN** the only outstanding reason is a blocking execution result and no finding is open
- **THEN** the next action is `openspec_review action=resume review=<entry>`
- **AND** it is not `openspec_review action=dispose`

### Requirement: Findings do not name another change

A report SHALL be refused when a new finding's `location` resolves under another change's directory under `openspec/changes/`, including `openspec/changes/archive/`. The refusal SHALL name the finding and instruct the reviewer to record the concern in `outOfScope` instead. The check SHALL apply to draft and apply reports from self-review and independent reviewers.

#### Scenario: Another change's location is refused

- **WHEN** a report carries a finding at `openspec/changes/another-change/tasks.md:12`
- **THEN** the submission fails and names the finding and `outOfScope`
- **AND** no report is stored

#### Scenario: An archived change's location is refused

- **WHEN** a finding's location starts with `openspec/changes/archive/`
- **THEN** the submission fails and names `outOfScope`

#### Scenario: A parent-relative path is checked

- **WHEN** a draft finding's location is `../another-change/tasks.md:12`
- **THEN** the submission fails because the location resolves under another change

#### Scenario: A nested-root location is refused

- **WHEN** a finding's location is `apps/web/openspec/changes/another-change/tasks.md:12`
- **THEN** the submission fails because the location resolves under another change

#### Scenario: An interior parent path is refused

- **WHEN** a finding's location is `openspec/changes/<reviewed-change>/../another-change/tasks.md:12`
- **THEN** the submission fails because the location resolves under another change

#### Scenario: Both reviewer modes use the check

- **WHEN** a self-review and an independent reviewer each submit a report with another change's location
- **THEN** both submissions fail before a report is stored

### Requirement: Only another change's location is refused

A finding's `location` that names the reviewed change SHALL be accepted. A location with no `openspec/changes/` segment that names a main spec, code, documentation, a change-relative artifact path or a section heading SHALL be accepted. A location carrying an `openspec/changes/` segment at any depth SHALL be treated as a change location, even when the path is a fixture or documentation path. An `outOfScope` entry that names another change SHALL be accepted.

#### Scenario: The reviewed change's location is accepted

- **WHEN** a finding's location is `openspec/changes/<reviewed-change>/proposal.md:12`
- **THEN** the report is accepted

#### Scenario: A location without the segment is accepted

- **WHEN** a finding's location is a main spec path, a code path, a change-relative artifact path or a section heading, and it has no `openspec/changes/` segment
- **THEN** the report is accepted

#### Scenario: A fixture path carrying the segment is refused

- **WHEN** a finding's location is `test/fixtures/probe/openspec/changes/add-dark-mode/tasks.md:12`
- **THEN** the submission fails because the path carries a change location

#### Scenario: A concern in outOfScope is accepted

- **WHEN** another change's path is listed in `outOfScope` and the findings list is empty
- **THEN** the report is accepted

### Requirement: Review briefs state the cross-change boundary

The draft and apply briefs SHALL state that another change's directory under `openspec/changes/` is outside the review's scope even when it appears in the reviewed tree or workspace, that a finding requiring it to change is refused, and that such a concern belongs in `outOfScope`. The apply brief SHALL still state that the whole committed tree is the review object.

#### Scenario: The draft brief states the boundary

- **WHEN** a draft review returns its brief
- **THEN** the brief states that another change's directory is outside the review's scope and that the concern belongs in `outOfScope`

#### Scenario: The apply brief states the boundary

- **WHEN** an apply review returns its brief
- **THEN** the brief states that another change's directory is outside the review's scope and that the concern belongs in `outOfScope`
- **AND** it still states that the whole committed tree is the review object

### Requirement: The policy records its configuration source

The policy SHALL record the configuration source: the path relative to the project root when the file is inside it, otherwise the absolute path, the file's sha256, every entry's profile name and the pipeline. A policy written before this field existed SHALL be read as locked and SHALL NOT be rewritten to add it.

#### Scenario: A new policy carries the source

- **WHEN** a change locks its policy from the project file
- **THEN** the policy carries `source.path` `openspec/reviews.json`, its sha256, every entry's profile name and the pipeline

#### Scenario: The first start names another file

- **WHEN** the first review start supplies a configuration path
- **THEN** the policy is resolved from that file and its source facts name that path

#### Scenario: An older policy has no source

- **WHEN** a review reads a policy that records no source
- **THEN** the review proceeds with the recorded parameters

#### Scenario: The file hash differs from the recorded hash

- **WHEN** the project file has changed since the policy was locked
- **THEN** the review proceeds and does not fail on the difference

### Requirement: A locked policy is never relocked

A locked policy SHALL keep its parameters for the change's lifetime. The plugin SHALL NOT compare the current file with the locked source, SHALL NOT offer a relock action, and SHALL NOT fail a review because the file changed.

#### Scenario: The file changes after locking

- **WHEN** the project review file changes and the change's review resumes
- **THEN** the review continues with the locked parameters

#### Scenario: A caller tries to relock

- **WHEN** a caller looks for a relock argument on `openspec_review`
- **THEN** the tool exposes none and the existing argument set is unchanged

### Requirement: The disabled switch clears every review gate

When `reviewEnabled` is false, every entry's readiness gate SHALL pass for a change whose locked policy enables it, so the lifecycle steps named by the pipeline are not blocked by reviews the plugin no longer offers. The locked policy SHALL keep its recorded entries and pipeline.

#### Scenario: A locked change applies under the disabled switch

- **WHEN** `reviewEnabled` is false and a change's locked policy enables the `beforeApply` entry
- **THEN** `openspec_apply_next` does not refuse on that entry's gate

#### Scenario: A locked change archives under the disabled switch

- **WHEN** `reviewEnabled` is false and a change's locked policy enables the `beforeArchive` entry
- **THEN** `openspec_archive` does not require that entry

#### Scenario: The switch is re-enabled

- **WHEN** `reviewEnabled` is true again
- **THEN** the same change's gates enforce the recorded policy

### Requirement: A blocked draft attempt does not consume a round

A draft resume that finds its latest attempt unreported or blocked SHALL NOT open a new round. It SHALL archive that attempt as a revision and refresh the same round when the object differs or the attempt was blocked. A blocked report SHALL NOT conclude the round and its findings SHALL NOT enter the finding lifecycle. Only a `pass` or `changes-requested` report SHALL end the attempt.

#### Scenario: A stale attempt keeps its round number

- **WHEN** the artifacts change during an open draft round without a substantive report
- **THEN** `resume` refreshes that round and its number is unchanged

#### Scenario: A blocked attempt keeps its round number

- **WHEN** the reviewer submits a blocked report and `resume` runs
- **THEN** the blocked attempt is archived and the same round is refreshed

#### Scenario: A substantive report opens the next round

- **WHEN** the latest attempt carries a `pass` or `changes-requested` report and no finding is open
- **THEN** `resume` records the next round and the round number advances

#### Scenario: A blocked report adds no finding to the record

- **WHEN** a blocked report carries findings
- **THEN** the report file keeps them and the recorded finding list is unchanged

### Requirement: A blocked draft round keeps its audit

Every archived draft attempt SHALL remain readable under `round-N/revisions/MM/`: the previous brief, its hashes, an optional blocked report, the cause, any watch notice and the archive time. The record SHALL carry the same facts in a `revisions` array. Archiving SHALL NOT change recorded findings or their statuses.

#### Scenario: The archive keeps the previous brief

- **WHEN** an attempt is archived
- **THEN** `round-N/revisions/MM/brief.md` holds the brief that version was reviewed against

#### Scenario: The archive keeps a blocked report

- **WHEN** the archived attempt carries a blocked report
- **THEN** `round-N/revisions/MM/report.json` holds that report and the record names its path, verdict and hash

#### Scenario: The archive names the cause

- **WHEN** an attempt is archived
- **THEN** its revision records the object hash, artifact hash, cause and archive time

#### Scenario: The audit stays readable after the review finishes

- **WHEN** the review later passes or is archived
- **THEN** every recorded revision and its files remain readable

### Requirement: Draft readiness treats a blocked attempt as unreported

The draft review SHALL be ready only with a valid `pass` report, every in-threshold finding resolved or user-waived, no blocking length or execution result, and a matching hash. A below-threshold finding SHALL NOT block readiness whatever its status. A `blocked` draft report SHALL count as an unreported attempt and the next action SHALL name a draft `resume`. Apply SHALL be refused while an enabled draft review is not ready; after apply starts, apply review rechecks both results.

#### Scenario: Ready review passes apply

- **WHEN** the draft review has a passing report, no unresolved in-threshold finding, no blocking length or execution result and a matching artifact hash
- **THEN** `openspec_apply_next` proceeds

#### Scenario: A below-threshold finding does not block readiness

- **WHEN** the draft review has a passing report and the only open finding is below the pass criteria
- **THEN** the draft review is ready

#### Scenario: Blocking length result blocks the first apply entry

- **WHEN** before apply starts, the draft record has a blocking length result and no unresolved in-threshold finding
- **THEN** `openspec_apply_next` fails and names `openspec_review` with `action: "resume"` and `review: "draft"`

#### Scenario: Blocking execution result blocks the first apply entry

- **WHEN** before apply starts, the draft record has a blocking execution result and no unresolved in-threshold finding
- **THEN** `openspec_apply_next` fails and names `openspec_review` with `action: "resume"` and `review: "draft"`

#### Scenario: Open blocker blocks apply

- **WHEN** the latest report has a finding at or above `passCriteria` that is not resolved
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

#### Scenario: A started apply defers the execution check

- **WHEN** apply started and the current artifacts carry a blocking execution result
- **THEN** `openspec_apply_next` does not refuse the resync for that result
- **AND** apply review start or resume rechecks it

#### Scenario: Apply resync after a plan change proceeds

- **WHEN** `openspec_apply_next` runs again after apply started and the plan changed
- **THEN** the draft hash mismatch does not refuse the call

#### Scenario: A blocked report does not make the review ready

- **WHEN** the latest attempt carries a `blocked` report
- **THEN** the draft review is not ready and the next action names `openspec_review` with `action: "resume"` and `review: "draft"`

#### Scenario: A refreshed attempt waits for its report

- **WHEN** `resume` archived a blocked report and refreshed the same round
- **THEN** the review is not ready until the reviewer reports on the refreshed brief

### Requirement: Resume refreshes an unreported or blocked draft attempt

`openspec_review` with `action: "resume"` SHALL continue a recorded draft or apply review and refuse one without a record. It opens a new round only when the latest attempt has a substantive report and no finding is open. An unreported or blocked draft attempt reuses the same round: an unchanged object keeps it; a changed object or a blocked attempt refreshes it after archiving a revision. It returns a passing brief, refuses an abandoned review, and refuses a draft resume after apply started.

#### Scenario: A recorded draft review opens another round

- **WHEN** the latest draft attempt carries a substantive report, no recorded finding is open, and `resume` is called before apply started
- **THEN** the next round is recorded with the current object hash and a new brief

#### Scenario: An unreported round is reused

- **WHEN** the latest round has no report, its object hash still matches, and `resume` is called
- **THEN** the round number does not change and the recorded brief stays the one being reviewed

#### Scenario: A stale unreported round is refreshed

- **WHEN** the latest round has no report, its object hash differs, and `resume` is called
- **THEN** the attempt is archived as a revision and the same round is refreshed for the current object
- **AND** no new round is recorded

#### Scenario: A blocked round is refreshed

- **WHEN** the latest round carries a blocked report and `resume` is called
- **THEN** the blocked attempt is archived as a revision and the same round is refreshed
- **AND** no new round is recorded

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

### Requirement: The draft watch reports each changed object version

While a directory entry with `reviewers: 1` has no report, the plugin SHALL watch the change directory and compare its hash with the attempt's hash. On a change it SHALL record one notice for that version and send a `blocked` instruction naming the moved hash. It SHALL keep every notice with its revision, stop at a report (including blocked), an abandoned review or unload, write no report or finding, and log instead of sending when the changer is gone. A refreshed attempt SHALL arm the watch.

#### Scenario: An edit during a round notifies the reviewer once

- **WHEN** the object hash changes while the attempt has no report
- **THEN** one message reaches the slot reviewer and the record carries the notice for that object version
- **AND** a second change to the same object version sends no second message

#### Scenario: A later stale round gets its own notice

- **WHEN** an earlier object version already recorded a notice and a later version changes
- **THEN** that later version sends one notice of its own

#### Scenario: A recorded report stops the watch

- **WHEN** a `pass` or `changes-requested` report is recorded for the round
- **THEN** a later edit sends no message

#### Scenario: A blocked report stops the watch for that version

- **WHEN** a blocked report is recorded for the attempt
- **THEN** the watch stops until `resume` archives it and arms the next version

#### Scenario: The notice writes no review content

- **WHEN** the watch sends its notice
- **THEN** the attempt still has no substantive report until the reviewer submits or a resume archives it

#### Scenario: A watch that cannot be armed leaves the review usable

- **WHEN** the watch cannot be armed or cannot take the review lock
- **THEN** the review call still returns normally and a warning is logged

#### Scenario: A late blocked submission names its round

- **WHEN** the notice's round is no longer current and the reviewer submits `blocked` for that round
- **THEN** the call fails naming the current round and no report is stored

#### Scenario: The changer agent is gone

- **WHEN** the notice is taken and the changer agent can no longer be addressed
- **THEN** the notice is logged and no message is sent
- **AND** a later resume still archives the attempt

#### Scenario: A refreshed round arms a new notice

- **WHEN** `resume` refreshes a blocked attempt
- **THEN** the watch is armed again for the refreshed object version

### Requirement: A review entry runs the flow of its profile object

Every locked entry SHALL run one of two flows selected by its profile `object`. A `directory` entry SHALL review the change artifacts and use the draft report, intent, blocked-round and revision contract. A `tree` entry SHALL review the committed tree and use the apply base, strict validation, report, finding and plan-change waiver contract. The rebase extra-round contract SHALL remain specific to the `apply` entry; another tree entry uses normal rounds. The entry name SHALL NOT select the flow.

#### Scenario: A directory entry uses the artifact flow

- **WHEN** a locked entry names a profile whose `object` is `directory`
- **THEN** its review object is the change artifacts and its report follows the draft report contract

#### Scenario: A tree entry uses the committed tree flow

- **WHEN** a locked entry names a profile whose `object` is `tree`
- **THEN** its review object is the committed tree and its report follows the apply report contract

#### Scenario: An entry named pr uses the tree flow

- **WHEN** a change locks a `pr` entry whose profile `object` is `tree`
- **THEN** `openspec_review` with `review: "pr"` starts a tree review with its own record

#### Scenario: Two flows run independently

- **WHEN** a change has a directory entry and a tree entry
- **THEN** each entry owns its rounds, findings and readiness
- **AND** one entry's report does not conclude the other entry

### Requirement: Review record files are named by entry

The plugin SHALL name each entry's record file and round directory from the entry name. `draft` SHALL keep `review.json` and `round-N`; `apply` SHALL keep `apply-review.json` and `apply-round-N`; every other entry SHALL use `<entry>-review.json` and `<entry>-round-N`. A record written under an earlier name SHALL stay readable, and adding an entry SHALL NOT rename an existing record.

#### Scenario: A pr entry gets its own record file

- **WHEN** a change starts its `pr` entry
- **THEN** the record is `pr-review.json` and its first round directory is `pr-round-1`

#### Scenario: Draft and apply keep their names

- **WHEN** a change starts its `draft` and `apply` entries
- **THEN** the records are `review.json` and `apply-review.json`
- **AND** the round directories are `round-N` and `apply-round-N`

#### Scenario: An existing record is not renamed

- **WHEN** a change already has an `apply-review.json` and its policy later adds a `pr` entry
- **THEN** the apply record keeps its name and the new entry writes `pr-review.json`

#### Scenario: A legacy record stays readable

- **WHEN** a change has a record under an earlier name
- **THEN** the plugin reads it under that name and does not copy it to a new name

### Requirement: Review briefs and status name the review entry

The brief for every entry SHALL name the entry, its object type and its flow. A directory entry's brief SHALL name the artifact paths and the intent; a tree entry's brief SHALL name the base and the committed tree. Status, wait, report and next actions SHALL carry the entry name, so two entries on one change are distinguishable.

#### Scenario: A directory brief names its entry

- **WHEN** a `draft` entry returns its brief
- **THEN** the brief names `draft`, the directory object and the artifact paths

#### Scenario: A pr brief names its entry

- **WHEN** a `pr` entry returns its brief
- **THEN** the brief names `pr`, the tree object, the base and the tree

#### Scenario: Status separates two entries

- **WHEN** a change has `draft` and `pr` records and a caller reads status for each
- **THEN** each result names its own entry and readiness

### Requirement: The pipeline selects the apply and archive gate entries

`openspec_apply_next` SHALL gate on the record of the entry named by `pipeline.beforeApply`, which SHALL be a directory entry. `openspec_archive`, and a land that archives, SHALL gate on the record of the entry named by `pipeline.beforeArchive`, which SHALL be a tree entry. A gate whose entry is disabled or unavailable SHALL NOT hold the lifecycle step. The gate SHALL check that entry's readiness and object binding only.

#### Scenario: Apply waits for the beforeApply entry

- **WHEN** `openspec_apply_next` runs for a change whose `beforeApply` entry is enabled and not ready
- **THEN** the call fails and names `openspec_review` for that entry

#### Scenario: Archive waits for the beforeArchive entry

- **WHEN** `openspec_archive` runs for a change whose `beforeArchive` entry is enabled and not ready
- **THEN** the call fails and names that entry

#### Scenario: A gate entry with the wrong object is refused

- **WHEN** a locked policy names a tree entry as `beforeApply` or a directory entry as `beforeArchive`
- **THEN** the plugin refuses the policy and names the entry and the required object

#### Scenario: A disabled gate entry does not hold the step

- **WHEN** the policy disables the `beforeApply` or `beforeArchive` entry
- **THEN** the corresponding lifecycle step proceeds without that review check

#### Scenario: A missing gate entry does not hold the step

- **WHEN** a legacy policy declares no pipeline and no tree entry
- **THEN** archive proceeds without a tree review check

### Requirement: Legacy policies are read with the default entries

Reading a legacy policy SHALL NOT rewrite it: a recorded `draft` is a directory entry, a recorded `apply` a tree entry, an absent section stays absent, and the default pipeline fills missing roles. The first start or resume with `configPath` SHALL supplement missing entry sections and the pipeline once. The supplemented policy records schema version 3 and each added entry's object, adds no `source` and no object to a legacy section, and is locked.

#### Scenario: An older policy is read with defaults

- **WHEN** a policy records `reviews.draft` and `reviews.apply` but no `pipeline` and no entry object
- **THEN** the plugin reads `draft` as directory, `apply` as tree and the default pipeline

#### Scenario: A draft-only legacy policy keeps its absent section

- **WHEN** a legacy policy records only a `draft` section
- **THEN** the `draft` entry stays available and the absent `apply` section disables its gate

#### Scenario: The older policy is not rewritten

- **WHEN** a review reads an older policy without `configPath` and completes the call
- **THEN** `policy.json` keeps its previous bytes and schema version

#### Scenario: The first configPath supplements a legacy policy once

- **WHEN** the first start supplies `configPath` for a legacy policy missing an entry and the pipeline
- **THEN** the policy gains the missing entry with its object, the pipeline and schema version 3
- **AND** an existing legacy section keeps no object and the policy keeps no `source`

#### Scenario: A later configPath does not supplement again

- **WHEN** a later start or resume supplies `configPath` after the one supplement
- **THEN** the policy bytes are unchanged

#### Scenario: A new policy records the entry model

- **WHEN** a change locks a policy from a file with entries and a pipeline
- **THEN** the policy records schema version 3, each entry's object and the pipeline

### Requirement: Apply readiness follows the pass criteria

The apply readiness condition in the shared apply-report contract SHALL follow the entry's `passCriteria`: every finding at or above `passCriteria` SHALL be resolved or user-waived, and a below-threshold finding SHALL NOT block readiness whatever its status. This requirement refines that contract's blocking condition.

#### Scenario: An in-threshold finding blocks apply readiness

- **WHEN** `passCriteria` is `minor` and the latest apply report leaves an open `minor` finding
- **THEN** the apply review is not ready and archive is refused

#### Scenario: A below-threshold finding does not block apply readiness

- **WHEN** `passCriteria` is `major` and the latest apply report leaves only an open `minor` finding
- **THEN** the apply review is ready

#### Scenario: The default threshold keeps the critical and major rule

- **WHEN** a profile omits `passCriteria` and the latest report leaves an open `major` finding
- **THEN** the apply review is not ready

### Requirement: Dispositions honor the pass criteria

A `deferred` disposition SHALL be refused when `allowDeferred` is false or the finding's severity is at or above `passCriteria`. A `rejected` disposition SHALL be refused when `allowRejected` is false or the severity is at or above `passCriteria`. `fixed` and user `waived` SHALL remain available for every finding. A refused disposition SHALL leave the finding unchanged.

#### Scenario: An in-threshold finding cannot be deferred

- **WHEN** a caller defers a finding whose severity is at or above `passCriteria` and `allowDeferred` is true
- **THEN** the disposition is refused and the finding keeps its status

#### Scenario: An in-threshold finding cannot be rejected

- **WHEN** a caller rejects a finding whose severity is at or above `passCriteria` and `allowRejected` is true
- **THEN** the disposition is refused and the finding keeps its status

#### Scenario: A below-threshold finding can be deferred

- **WHEN** a caller defers a below-threshold finding and `allowDeferred` is true
- **THEN** the finding becomes `deferred`

#### Scenario: A below-threshold finding can be rejected

- **WHEN** a caller rejects a below-threshold finding with evidence and `allowRejected` is true
- **THEN** the finding becomes `rejected`

#### Scenario: A closed switch refuses the disposition

- **WHEN** `allowDeferred` is false and a caller defers a below-threshold finding
- **THEN** the disposition is refused

#### Scenario: A refused batch changes nothing

- **WHEN** a disposition batch contains one refused `deferred` entry and one valid entry
- **THEN** the call fails and every finding keeps its status

### Requirement: The report verdict follows the pass criteria

A report SHALL be refused when `verdict` is `pass` and a finding at or above `passCriteria` is unresolved, or when `verdict` is `changes-requested` and no finding at or above `passCriteria` is unresolved. `blocked` SHALL keep its current meaning. A below-threshold finding SHALL NOT decide either verdict.

#### Scenario: A pass report with an unresolved in-threshold finding

- **WHEN** a report carries `verdict: "pass"` and an unresolved finding at or above `passCriteria`
- **THEN** the report is refused and names every unresolved in-threshold finding

#### Scenario: A pass report with only below-threshold findings

- **WHEN** a report carries `verdict: "pass"` and every unresolved finding is below `passCriteria`
- **THEN** the report is accepted

#### Scenario: A changes-requested report without an in-threshold finding

- **WHEN** a report carries `verdict: "changes-requested"` and no finding at or above `passCriteria` is unresolved
- **THEN** the report is refused

#### Scenario: A changes-requested report with an in-threshold finding

- **WHEN** a report carries `verdict: "changes-requested"` and an unresolved finding at or above `passCriteria`
- **THEN** the report is accepted

#### Scenario: A blocked report keeps its meaning

- **WHEN** a report carries `verdict: "blocked"`
- **THEN** the verdict is accepted without the pass-criteria check

### Requirement: The policy locks the pass criteria and disposition switches

The policy SHALL lock `passCriteria`, `allowDeferred` and `allowRejected` for every review section, defaulting to `major`, `true` and `true` when a profile omits them. A policy written before these fields existed SHALL read those defaults and SHALL NOT be rewritten.

#### Scenario: A new policy records the values

- **WHEN** a change locks a policy from a profile that carries the three fields
- **THEN** each review section records its values

#### Scenario: Omitted fields lock defaults

- **WHEN** a profile omits `passCriteria`, `allowDeferred` and `allowRejected`
- **THEN** the locked section records `major`, `true` and `true`

#### Scenario: A legacy policy reads defaults

- **WHEN** a policy written before this change carries no pass-criteria fields
- **THEN** the review reads `major`, `true` and `true`
- **AND** the policy file is not rewritten

#### Scenario: A later file edit does not change the lock

- **WHEN** the project review file changes after the policy is locked
- **THEN** the change keeps the recorded pass criteria and switches

### Requirement: Apply review re-bases a draft diff onto the current fork

When a draft-baseline round resolves its base and the seal commit's parent is an ancestor of the current fork (`git merge-base HEAD origin/main`) but not the fork itself, the plugin SHALL use the fork as the base commit and a base tree that equals the fork tree overlaid with the paths the seal commit changed. It SHALL record the source as `rebase` and the seal commit as `rebasedFrom`. Otherwise the seal commit SHALL stay the base.

#### Scenario: The branch is rebased onto newer main

- **WHEN** a draft-baseline round starts or resumes and the seal commit's parent is an ancestor of the current fork but not the fork
- **THEN** the base commit is the fork and the base tree is the fork tree overlaid with the paths the seal commit changed
- **AND** the source is `rebase` and `rebasedFrom` is the seal commit

#### Scenario: Main is merged into the branch

- **WHEN** the branch gained the newer main through a merge commit instead of a rebase
- **THEN** the same re-based base tree and `rebase` source are recorded

#### Scenario: Main advanced without entering the branch

- **WHEN** the seal commit's parent equals the current fork
- **THEN** the seal commit stays the base and the source stays `seal`

#### Scenario: The fork cannot be resolved

- **WHEN** `git merge-base HEAD origin/main` cannot be resolved
- **THEN** the seal commit stays the base and no rebase is recorded

#### Scenario: The overlay tree cannot be built

- **WHEN** the overlaid base tree cannot be written with a temporary index, or it differs from the fork tree on a path the seal commit did not change
- **THEN** the round fails and asks for an explicit `base`

#### Scenario: An explicit base stays authoritative

- **WHEN** the round receives a non-empty `base`
- **THEN** that base is used and no re-base happens

### Requirement: A no-draft apply review re-bases an automatic base

When a no-draft round resolves its base without an explicit `base` and the recorded base source is `merge-base`, the plugin SHALL use the current fork as the base commit and its tree as the base tree when the recorded base commit is an ancestor of the fork but not the fork itself, record the source as `merge-base`, and record the recorded base as `rebasedFrom`. A recorded base with source `explicit`, or one that is not an ancestor of the fork, SHALL stay authoritative.

#### Scenario: The automatic recorded base is behind the fork

- **WHEN** a no-draft round starts or resumes without an explicit `base`, the recorded source is `merge-base`, and the recorded base commit is an ancestor of the fork but not the fork
- **THEN** the base commit is the fork, the base tree is the fork tree and the source is `merge-base`
- **AND** the recorded base is stored as `rebasedFrom`

#### Scenario: The recorded base equals the fork

- **WHEN** the recorded base commit equals the fork
- **THEN** the recorded base and its source stay unchanged

#### Scenario: The recorded base is explicit

- **WHEN** the recorded base source is `explicit` and the recorded base commit is an ancestor of the fork
- **THEN** the recorded base stays authoritative
- **AND** the round proceeds without a re-base until the caller passes `base` again

#### Scenario: The recorded base is not an ancestor

- **WHEN** the recorded base commit is not an ancestor of the fork
- **THEN** the recorded base stays authoritative and no re-base happens
