# Spec Delta: review entry model

## ADDED Requirements

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

## MODIFIED Requirements

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

### Requirement: Apply review uses the draft base and report lifecycle

A tree entry SHALL reuse the directory entry's report, finding, severity and readiness contract. It SHALL record its own rounds and findings, and its `ready` result SHALL require a passing latest report, no open blocking finding, all dispositions, a matching `treeSha`, and every drift file waived. Its default draft baseline SHALL be the record of the `pipeline.beforeApply` entry. While `rebaseReview` is present, the matching tree SHALL be the latest extra round's tree.

#### Scenario: Apply review passes

- **WHEN** the latest tree report passes, no blocker is open, the tree matches and every drift file is waived
- **THEN** the tree entry is ready

#### Scenario: Apply review finds a blocker

- **WHEN** the latest report carries an open critical or major finding
- **THEN** the entry is not ready and its gate refuses the lifecycle step

#### Scenario: Apply review starts from the seal commit

- **WHEN** the first tree round opens after a git seal and no explicit base is passed
- **THEN** its base is the beforeApply entry's apply base commit
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

### Requirement: Apply review binds the reviewed draft artifacts

A tree entry SHALL NOT refuse a start or resume when the change artifacts inside the current tree differ from the `beforeApply` entry's recorded artifact hash. It SHALL record the draft hash, current hash and changed artifact paths in the tree record and list them in the brief for the plan axes.

#### Scenario: Applied tree matches the draft

- **WHEN** the current change artifacts equal the `beforeApply` entry's artifact hash
- **THEN** the tree entry may start or resume

#### Scenario: Applied tree changed the plan

- **WHEN** an artifact differs from the `beforeApply` hash and the file is inside the waiver file set
- **THEN** the tree entry start or resume opens a round
- **AND** the brief lists the changed artifacts on the plan axes

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
