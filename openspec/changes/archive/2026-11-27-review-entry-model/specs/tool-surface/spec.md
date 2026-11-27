# Spec Delta: review entry model

## ADDED Requirements

### Requirement: The review parameter selects a configured entry

`openspec_review` SHALL declare `review` as an optional plain string, not an enum, selecting one entry; its schemas SHALL use that string. An omitted value SHALL mean `draft`, except `dispose` and a finding `waive`, which require it. The accepted values SHALL be the entries in the change's locked policy; a change without a policy SHALL resolve the value against the project review file. An unknown entry SHALL be refused before any record is read and the error SHALL name the configured entries.

#### Scenario: The parameter is omitted

- **WHEN** a caller omits `review`
- **THEN** the call uses the `draft` entry

#### Scenario: A pr entry is selected

- **WHEN** the locked policy declares a `pr` entry and the caller passes `review: "pr"`
- **THEN** the call reads and writes the `pr` record

#### Scenario: A disposal still requires the parameter

- **WHEN** `dispose` or a finding `waive` omits `review`
- **THEN** the call fails before any write and names the configured entries

#### Scenario: An unknown entry is refused

- **WHEN** the caller passes a name that the locked policy does not declare
- **THEN** the call fails before any record is read
- **AND** the error names the configured entries

#### Scenario: A change without a policy resolves the file

- **WHEN** a change has no policy and the first start passes an entry name
- **THEN** the policy is locked from the project review file and the entry resolves from it

### Requirement: The reviewer tool follows the locked entry

`openspec_reviewer` SHALL accept `review` as an optional plain string, not an enum, with any entry in the locked policy; its `read`, `submit` and `status` SHALL use that entry's record, brief and round. An omitted value SHALL mean `draft`. An unknown entry SHALL be refused and name the configured entries.

#### Scenario: The reviewer reads a pr brief

- **WHEN** the reviewer calls `read` with `review: "pr"` and `target: "brief"`
- **THEN** it receives the `pr` round brief

#### Scenario: The reviewer submits for a pr entry

- **WHEN** the reviewer calls `submit` with `review: "pr"` and a valid report
- **THEN** the report is stored on the `pr` record and wakes the changer

#### Scenario: An unknown entry is refused

- **WHEN** the reviewer passes an entry name the locked policy does not declare
- **THEN** the call fails and names the configured entries

## MODIFIED Requirements

### Requirement: Draft review is exposed as one tool

The plugin SHALL expose `openspec_review` for every configured review entry. Its `action` parameter SHALL select `start`, `resume`, `wait`, `status`, `self-report`, `report`, `dispose`, `waive`, `retry`, `replace`, `waive-reviewer`, `extend` or `abandon`. Its `review` parameter SHALL select the entry and SHALL default to `draft`. The tool SHALL return the review id, the entry name, the current round, the object binding, the status and the next action.

#### Scenario: Draft review starts

- **WHEN** an agent calls `openspec_review` with `action: "start"` and `review: "draft"`
- **THEN** the result names the review id, entry, round, artifact hash and a brief
- **AND** the brief lists the draft review axes and the artifact paths

#### Scenario: Draft review resumes

- **WHEN** an agent calls `openspec_review` with `action: "resume"` and `review: "draft"` for a recorded review
- **THEN** the result names the current round, artifact hash and the round brief

#### Scenario: A pr review starts

- **WHEN** an agent calls `openspec_review` with `action: "start"` and `review: "pr"`
- **THEN** the result names the review id, `pr`, round, commit, tree and a brief

#### Scenario: Review status is read

- **WHEN** an agent calls `openspec_review` with `action: "status"`
- **THEN** the result reports the state, whether the review is ready, the blockers, the entry name and the next action

#### Scenario: Self-review report is submitted

- **WHEN** an agent calls `self-report` with a valid report for a `reviewers: 0` review
- **THEN** the report is stored and the status reflects its verdict

#### Scenario: Unknown action is refused

- **WHEN** `openspec_review` receives an action outside the supported set
- **THEN** the parameter schema rejects the call before execution

#### Scenario: Every accepted action is described

- **WHEN** an agent reads the `openspec_review` `action` parameter
- **THEN** its description names every value the parameter accepts, including `wait`, `retry`, `replace` and `waive-reviewer`

### Requirement: Apply waits for a ready draft review

`openspec_apply_next` SHALL check the `pipeline.beforeApply` entry and the applicable lock before the apply state. An unready entry names `openspec_review` with that entry; a foreign lock names the holder. Git worktree apply uses the per-change lock for implementation and keeps the store-domain lock; compatibility and non-git use the project lock. A first git worktree apply SHALL construct the seal commit in the same call and record it as the base; a later draft mismatch does not refuse.

#### Scenario: Review is not ready

- **WHEN** `openspec_apply_next` runs for a change whose `beforeApply` review is not ready
- **THEN** the call fails, the apply state is unchanged and the error names `openspec_review`

#### Scenario: Review is ready

- **WHEN** `openspec_apply_next` runs for a change whose `beforeApply` review is ready
- **THEN** the call proceeds and returns the apply projection

#### Scenario: Review is disabled

- **WHEN** the change policy disables the `beforeApply` entry
- **THEN** `openspec_apply_next` proceeds without a review check and still enforces the applicable lock

#### Scenario: Change has no policy

- **WHEN** a legacy change has no review policy
- **THEN** `openspec_apply_next` proceeds without a review check and still enforces the applicable lock

#### Scenario: Ready review passes apply

- **WHEN** the change has a ready `beforeApply` review in a git worktree apply and the working tree matches the draft
- **THEN** `openspec_apply_next` proceeds, constructs the seal commit and records it as the apply base

#### Scenario: Dirty tree is refused before the seal

- **WHEN** a file outside the change directory, outside other `openspec/changes/**` directories and outside the plugin-written `openspec/.gitignore` has uncommitted changes before the first apply
- **THEN** the tool fails without changing the apply state and asks for a clean working tree

#### Scenario: Another change's uncommitted artifacts are accepted

- **WHEN** only uncommitted files under another `openspec/changes/**` directory remain apart from the change directory and the plugin-written ignore file before the first apply
- **THEN** the tool proceeds

#### Scenario: Mixed seal commit is refused

- **WHEN** the worktree setting is disabled and `HEAD` also changes a file outside the change directory, `openspec/.gitignore` and `openspec/changes/` before the first apply
- **THEN** the tool fails and asks for a commit containing only OpenSpec change paths

#### Scenario: The construction stages only the change directory

- **WHEN** the working tree has other modified files before the first apply
- **THEN** the constructed seal commit changes only the change directory and the plugin-written ignore file

#### Scenario: Apply resync after a plan change proceeds

- **WHEN** apply already started and the draft artifact hash no longer matches
- **THEN** the tool does not refuse the call on that mismatch

#### Scenario: Another identity holds the apply lock

- **WHEN** a change whose `beforeApply` review is ready calls `openspec_apply_next` while a lock names a different identity
- **THEN** the call fails, the apply state is unchanged and the error names the holder

#### Scenario: A store change from another project is refused

- **WHEN** a store change is applied from a second project while the store lock records the first project
- **THEN** the call fails because the implementation roots differ

#### Scenario: A non-git project enforces the lock

- **WHEN** a second change calls `openspec_apply_next` in a project without git while the lock names the first change
- **THEN** the call fails and names the holder

#### Scenario: The same implementation root re-enters apply

- **WHEN** `openspec_apply_next` runs again from the same implementation root for the change named by an apply lock
- **THEN** the call proceeds

### Requirement: Apply review is exposed through openspec_review

`openspec_review` SHALL accept any tree entry for `start`, `resume`, `status`, `self-report`, `report`, `dispose`, `waive`, `extend` and `abandon`. The result SHALL name the entry, commit, tree, base tree and readiness. The tool SHALL refuse a tree `start` outside a git repository; `status` is governed by the status requirement below. With `action: "waive"` and `scope: "plan-change"`, the tool SHALL accept `waiver` and `files` and record the plan-change waiver in the review directory.

#### Scenario: Apply review starts

- **WHEN** an agent calls `openspec_review` with `action: "start"` and `review: "apply"` on a clean commit
- **THEN** the result names the review id, entry, round, commit, tree and base tree

#### Scenario: Apply review resumes

- **WHEN** an agent calls `openspec_review` with `action: "resume"` and `review: "pr"` for a recorded review
- **THEN** the result names the entry, round, commit, tree and base tree

#### Scenario: Apply review is unavailable

- **WHEN** an agent requests a tree entry `start` without git
- **THEN** the call fails with an actionable error

#### Scenario: Apply report is submitted

- **WHEN** an agent submits a valid tree report
- **THEN** the report is stored and the status reflects its verdict

#### Scenario: Plan-change waiver is recorded

- **WHEN** apply started and `waive` is called with `scope: "plan-change"`, a non-empty `waiver`, `approvedBy: "user"` and `files`
- **THEN** the review directory carries the waiver and the result reports it

#### Scenario: Plan-change waiver before apply started is refused

- **WHEN** `waive` with `scope: "plan-change"` runs before apply started
- **THEN** the call fails and names the `beforeApply` entry

#### Scenario: Waiver result names uncovered drift

- **WHEN** a waiver is recorded while a tree record exists and a drift file stays outside its normalized file set
- **THEN** the result names that file
- **AND** the result does not report the waiver as covering it

### Requirement: Archive waits for a ready apply review

`openspec_archive` SHALL check the apply locks and the `pipeline.beforeArchive` entry before reading the change list or running validation. A lock naming another identity fails the call and moves nothing. An enabled unready entry returns no archive result and moves nothing; a disabled entry or a project without git skips that check. With no lock it proceeds without writing one, and after a successful archive it releases the locks naming the archived change.

#### Scenario: Apply review is not ready

- **WHEN** `openspec_archive` runs for a change whose `beforeArchive` review is not ready
- **THEN** the call fails, no file moves and the error names `openspec_review`

#### Scenario: Apply review is ready

- **WHEN** the `beforeArchive` review is ready and the tree matches
- **THEN** `openspec_archive` may proceed

#### Scenario: A pr archive gate is ready

- **WHEN** the policy names `pr` as `beforeArchive`, the `pr` review is ready and its tree matches
- **THEN** `openspec_archive` may proceed without an `apply` record

#### Scenario: Apply review is disabled

- **WHEN** the change policy disables the `beforeArchive` entry
- **THEN** `openspec_archive` proceeds without that review check

#### Scenario: Another identity holds the apply lock

- **WHEN** `openspec_archive` runs for a change whose identity differs from a present lock's identity
- **THEN** the call fails and no file moves

#### Scenario: A store change from another project does not archive

- **WHEN** a store change is archived from a project other than the store lock's implementation root
- **THEN** the call fails and no file moves

#### Scenario: No lock naming another identity is required to archive

- **WHEN** no apply lock names another identity for a ready change
- **THEN** `openspec_archive` proceeds and writes no lock

#### Scenario: Archive releases its locks

- **WHEN** `openspec_archive` archives the change named by the present locks
- **THEN** every lock that names the change is removed after the archive succeeds

#### Scenario: Another change's uncommitted artifacts do not block archive

- **WHEN** only uncommitted files under another `openspec/changes/**` directory remain
- **THEN** archive proceeds

### Requirement: Apply review status reports policy, enabled and available

`openspec_review` with `action: "status"` and any entry SHALL report `policy`, `enabled` and `available`. `policy` SHALL be true when the locked policy carries that entry's section; `enabled` SHALL reflect that section; `available` SHALL be false without a git repository for a tree entry. For an unavailable, unset or disabled entry it SHALL return `ready: false` and the next action instead of failing.

#### Scenario: Status outside git with a new policy

- **WHEN** an agent calls status for a tree entry in a project without git whose policy was created by this plugin
- **THEN** the result has `policy: true`, `enabled: false` and `available: false`
- **AND** `reasons` names the missing git repository and `nextAction` is `openspec_archive`

#### Scenario: Status outside git with a legacy enabled policy

- **WHEN** a policy written before this change enables a tree entry in a project without git
- **THEN** the result has `policy: true`, `enabled: true` and `available: false`
- **AND** `reasons` names the missing git repository and `nextAction` is `openspec_archive`

#### Scenario: Status with a disabled policy

- **WHEN** a git project's change policy disables a tree entry
- **THEN** the result has `policy: true`, `enabled: false` and `available: true`
- **AND** it does not ask the agent to start the review and names `openspec_archive` as the next action

#### Scenario: Status with an enabled policy

- **WHEN** a git project's change policy enables a tree entry and the review has not started
- **THEN** the result has `policy: true`, `enabled: true` and `available: true`
- **AND** it names `openspec_review` with `action: "start"` and that entry as the next action

#### Scenario: Status with no policy

- **WHEN** a legacy change in a git project has no review policy
- **THEN** the result has `policy: false`, `enabled: false` and `available: true`
- **AND** `reasons` states that the first start locks a policy and `nextAction` is `openspec_review` with `action: "start"`

#### Scenario: Status with a draft-only policy

- **WHEN** a legacy policy carries no tree section
- **THEN** the result has `policy: false`, `enabled: false` and `available: true`
- **AND** `reasons` states that the first start or resume with `configPath` supplements the tree section
- **AND** `nextAction` names `openspec_review` with `action: "start"`, the tree entry and `configPath`
- **AND** without `configPath` that gate stays disabled

#### Scenario: Status outside git with no policy

- **WHEN** a legacy change in a project without git has no review policy
- **THEN** the result has `policy: false`, `enabled: false` and `available: false`
- **AND** `reasons` names the missing git repository and `nextAction` is `openspec_archive`

### Requirement: Review next actions name the round entry

A next action that names `openspec_review` with `start`, `resume`, `dispose` or a finding `waive` SHALL carry the entry name. It SHALL name `start` when the entry has no record; `resume` when a record exists, no finding is open, and either the object differs or a finding is fixed; and `dispose` with the entry name while any finding is open. Once apply started, a `beforeApply` next action SHALL name the `beforeArchive` entry status, not `resume` for the frozen entry.

#### Scenario: A not-started draft review names start

- **WHEN** `status` reads a change whose `beforeApply` entry has no record
- **THEN** `nextAction` is `openspec_review action=start review=draft`

#### Scenario: Fixed findings name resume

- **WHEN** the latest report is recorded, no finding is open, and findings are fixed but not verified
- **THEN** `nextAction` is `openspec_review action=resume review=draft`

#### Scenario: A stale apply object names resume

- **WHEN** an apply review has a record, no finding is open, and the current tree differs from the recorded tree
- **THEN** `nextAction` is `openspec_review action=resume review=apply`

#### Scenario: A stale pr object names resume

- **WHEN** a `pr` review has a record, no finding is open, and the current tree differs from the recorded tree
- **THEN** `nextAction` is `openspec_review action=resume review=pr`

#### Scenario: An open finding names dispose

- **WHEN** a draft record exists, the object changed and a finding is still open
- **THEN** `nextAction` is `openspec_review action=dispose review=draft`
- **AND** it does not name `resume`

#### Scenario: An open apply finding names dispose

- **WHEN** an apply record exists, the tree changed and a finding is still open
- **THEN** `nextAction` is `openspec_review action=dispose review=apply`
- **AND** it does not name `resume`

#### Scenario: An open pr finding names dispose

- **WHEN** a `pr` record exists, the tree changed and a finding is still open
- **THEN** `nextAction` is `openspec_review action=dispose review=pr`
- **AND** it does not name `resume`

#### Scenario: Draft status after apply started names the apply review

- **WHEN** `status` for a `beforeApply` review runs after apply started and the artifacts changed
- **THEN** the next action names the `beforeArchive` entry
- **AND** it does not name a frozen draft resume

### Requirement: Disposition actions name the review kind

`openspec_review` with `action: "dispose"` or a finding `action: "waive"` SHALL require the `review` parameter and SHALL reject a call that omits it before any write, naming the configured entry names.

#### Scenario: Missing review kind is refused

- **WHEN** a caller supplies `dispositions` for `dispose` without `review`
- **THEN** the call fails before any write
- **AND** the error names the configured entry names

### Requirement: Review status reports the configured mode before start

`openspec_review` with `action: "status"` SHALL report `mode` and `independent` for the requested entry from the locked policy when the entry has no record, is enabled and is available: `reviewers: 1` SHALL report `reviewer` and `true`; `reviewers: 0`, a disabled entry or an unavailable entry SHALL report `self` and `false`. No locked policy SHALL report `self` and `false` when the entry has no record. A recorded review SHALL report its recorded mode and independence.

#### Scenario: Apply status before start with one reviewer

- **WHEN** a git project's locked policy enables an apply entry with `reviewers: 1` and the entry has no record
- **THEN** the status reports `mode: "reviewer"` and `independent: true`
- **AND** it still reports `policy: true`, `enabled: true` and `available: true`

#### Scenario: A pr status before start with one reviewer

- **WHEN** a change's locked policy enables a `pr` entry with `reviewers: 1` and the entry has no record
- **THEN** the status reports `mode: "reviewer"` and `independent: true`

#### Scenario: Draft status before start with one reviewer

- **WHEN** a change's locked policy enables the draft entry with `reviewers: 1` and the entry has no record
- **THEN** the status reports `mode: "reviewer"` and `independent: true`

#### Scenario: A disabled draft policy keeps self

- **WHEN** a change's locked policy disables the draft entry with `reviewers: 1` and the entry has no record
- **THEN** the status reports `mode: "self"` and `independent: false`

#### Scenario: Status with a self review policy

- **WHEN** the locked policy sets the requested entry to `reviewers: 0`
- **THEN** the status reports `mode: "self"` and `independent: false`

#### Scenario: A disabled apply policy keeps self

- **WHEN** a git project's locked policy disables an apply entry with `reviewers: 1`
- **THEN** the status reports `mode: "self"` and `independent: false`
- **AND** it reports `enabled: false` and does not ask for a start

#### Scenario: A no-git project keeps self

- **WHEN** the project has no git repository and the locked policy sets a tree entry to `reviewers: 1`
- **THEN** the status reports `mode: "self"` and `independent: false`
- **AND** it reports `available: false`

#### Scenario: Status without a locked policy

- **WHEN** the change has no policy file and the entry has no record
- **THEN** the status reports `mode: "self"` and `independent: false`
- **AND** it does not fail

#### Scenario: A recorded review keeps its mode

- **WHEN** a review record exists with `mode: "reviewer"` and `independent: true`
- **THEN** the status reports those recorded values even when the policy would now resolve differently

#### Scenario: An unreadable policy fails both status kinds

- **WHEN** the locked `policy.json` cannot be parsed
- **THEN** status for every entry fails with the parse error

### Requirement: openspec_review accepts an explicit no-draft apply baseline

`openspec_review` SHALL declare an optional `baseline` string parameter for a tree entry's `start` and `resume`, with values `draft` and `none`. An omitted value SHALL mean `draft` on start when the `beforeApply` policy is enabled, `none` when it is disabled, and the recorded baseline on resume. The record SHALL store it; `status` and `report` SHALL return it. An explicit resume value different from the record SHALL be refused. Other actions SHALL ignore it.

#### Scenario: The schema declares baseline

- **WHEN** an agent reads the registered `openspec_review` parameter schema
- **THEN** `baseline` is an optional string with the values `draft` and `none`
- **AND** `baseline` is not listed in `required`

#### Scenario: A no-draft apply review starts

- **WHEN** a caller passes `action: "start"`, `review: "pr"`, `baseline: "none"` and a non-empty `base` on a clean committed tree, and the change has no `beforeApply` record
- **THEN** the `pr` review opens a round and records `baseline: "none"`

#### Scenario: A no-draft apply review requires base

- **WHEN** a caller explicitly passes `baseline: "none"` and no non-empty `base`
- **THEN** the call fails and names `base` as required

#### Scenario: An existing draft record refuses the no-draft baseline

- **WHEN** a change has a `beforeApply` record and the caller explicitly starts a tree entry with `baseline: "none"`
- **THEN** the call fails and names the draft review

#### Scenario: A draft-disabled policy records the none baseline

- **WHEN** the `beforeApply` policy is disabled and a caller starts a tree entry with an omitted baseline
- **THEN** the review opens and records `baseline: "none"`

#### Scenario: An explicit draft baseline is refused when the draft policy is disabled

- **WHEN** the `beforeApply` policy is disabled and a caller explicitly passes `baseline: "draft"`
- **THEN** the call fails and names `baseline: "none"`

#### Scenario: A resume keeps the recorded baseline

- **WHEN** a caller resumes a tree entry with an explicit baseline different from the recorded baseline
- **THEN** the call fails and names the recorded baseline

#### Scenario: An omitted resume baseline uses the record

- **WHEN** a caller resumes a tree entry recorded with `baseline: "none"` and omits `baseline`
- **THEN** the call proceeds with the recorded `none` baseline

#### Scenario: The default with an enabled draft policy requires a draft

- **WHEN** the `beforeApply` policy is enabled and a caller starts a tree entry without `baseline` for a change with no draft review record
- **THEN** the call fails as before and asks for a completed draft review

#### Scenario: Status reports the baseline

- **WHEN** a tree record stores `baseline: "none"`
- **THEN** `openspec_review` with `action: "status"` and that entry reports that baseline

#### Scenario: Report returns the baseline

- **WHEN** a tree record stores `baseline: "none"` and a caller reads its report
- **THEN** the result reports that baseline

#### Scenario: A legacy record reports the draft baseline

- **WHEN** a tree record has no `baseline` field
- **THEN** `status` and `report` report `draft` for it

#### Scenario: Other actions ignore baseline

- **WHEN** a caller passes `baseline` to an action other than a tree entry `start` or `resume`
- **THEN** the action behaves as if `baseline` were absent

### Requirement: openspec_review accepts a review configuration path

`openspec_review` SHALL declare an optional `configPath` string parameter naming the project review file used by the first policy lock. A relative value SHALL resolve against the project root. It SHALL be used when the call writes a policy; the first start or resume with `configPath` SHALL supplement missing entry sections and the pipeline once. It SHALL be ignored once the target policy is complete or was supplemented. `openspec_new_change` SHALL NOT accept the parameter.

#### Scenario: The first start names a file

- **WHEN** the first review start passes `configPath`
- **THEN** the policy is locked from that file and records it as the source

#### Scenario: A locked change passes the parameter

- **WHEN** a review call passes `configPath` for a change whose policy records every entry and the pipeline
- **THEN** the call continues and the recorded policy is unchanged

#### Scenario: A draft-only policy passes the parameter

- **WHEN** a review call passes `configPath` for a legacy policy that records no tree entry or no pipeline
- **THEN** the missing entry and pipeline are supplemented once
- **AND** the policy records schema version 3 and the added entry's object, without a new `source` or an object for the legacy section

#### Scenario: A second configPath call does not supplement again

- **WHEN** a later start or resume passes `configPath` after the one supplement
- **THEN** the policy bytes are unchanged

#### Scenario: A relative path is passed

- **WHEN** `configPath` is relative
- **THEN** it resolves against the project root

### Requirement: openspec_init writes the default review configuration

`openspec_init` SHALL create `openspec/reviews.json` with the default profiles, entries and pipeline when the file is absent, SHALL leave an existing file untouched, and SHALL report whether the file was created or already present.

#### Scenario: The file is created

- **WHEN** `openspec_init` runs in a project without the review file
- **THEN** it writes the default directory profile for draft, the default tree profile for apply, the entries and the default pipeline
- **AND** it reports the file as created

#### Scenario: The file already exists

- **WHEN** `openspec_init` runs in a project that has a review file
- **THEN** it does not modify the file and reports it as present

#### Scenario: The row config disables reviews

- **WHEN** `openspec_init` runs with `reviewEnabled` false
- **THEN** it still writes the default file when absent, because project initialization is independent of the review switch

### Requirement: Apply review accepts the reviewer actions

`openspec_review` SHALL accept any tree entry with `action: "wait"`, `"retry"`, `"replace"` or `"waive-reviewer"`. `wait` reads the reviewer state once and arms the round deadline; `retry` messages the same reviewer to submit again; `replace` activates a substitute reviewer for a reason; `waive-reviewer` records a user-approved coverage gap in place of a report.

#### Scenario: Apply review waits for the reviewer

- **WHEN** an agent calls `openspec_review` with `action: "wait"` and a tree entry while the reviewer round is open
- **THEN** the result reports the wait state and the next action

#### Scenario: Apply review replaces the reviewer

- **WHEN** an agent calls `openspec_review` with `action: "replace"`, a tree entry and a reason
- **THEN** a substitute reviewer is activated and the next action is `wait`

#### Scenario: Reviewer coverage is waived with user approval

- **WHEN** `waive-reviewer` runs with a tree entry, a waiver and `approvedBy: "user"` before the reviewer reports
- **THEN** the review records the coverage gap
- **AND** the same call without `approvedBy: "user"` is refused

### Requirement: A length-only block names draft resume

When a directory entry has a recorded report, no finding is open, and the only outstanding readiness reason is a blocking requirement-length result, the next action SHALL name `openspec_review` with `action: "resume"` and that entry. It SHALL NOT name `dispose`. When a finding is also open, the next action SHALL still name `dispose` with that entry. Before a report is recorded, the next action SHALL keep the round's `wait` or `self-report` action.

#### Scenario: A length-only block names resume

- **WHEN** a directory entry has a recorded report, a blocking length result, no finding open and the matching artifact hash
- **THEN** the next action is `openspec_review action=resume review=<entry>`
- **AND** it does not name `dispose`

#### Scenario: An unreported round keeps its report action

- **WHEN** a directory entry has a blocking length result and no report is recorded
- **THEN** the next action is `openspec_review action=wait` in reviewer mode or `openspec_review action=self-report` in self mode
- **AND** it does not name `resume` or `dispose`

#### Scenario: An open finding still names dispose

- **WHEN** a directory entry has a blocking length result and an open finding
- **THEN** the next action is `openspec_review action=dispose review=<entry>`

### Requirement: An execution-preflight block names draft resume

When a directory entry has a recorded report, no finding is open, and the only outstanding readiness reason is a blocking execution-preflight result, the next action SHALL name `openspec_review` with `action: "resume"` and that entry. It SHALL NOT name `dispose`. When a finding is also open, the next action SHALL still name `dispose` with that entry. Before a report is recorded, the next action SHALL keep the round's `wait` or `self-report` action.

#### Scenario: An execution-only block names resume

- **WHEN** a directory entry has a recorded report, a blocking execution result, no finding open and the matching artifact hash
- **THEN** the next action is `openspec_review action=resume review=<entry>`
- **AND** it does not name `dispose`

#### Scenario: Length and execution blocks name resume

- **WHEN** a directory entry has a recorded report, blocking length and execution results and no open finding
- **THEN** the next action is `openspec_review action=resume review=<entry>`

#### Scenario: An unreported round keeps its report action

- **WHEN** a directory entry has a blocking execution result and no report is recorded
- **THEN** the next action is `openspec_review action=wait` in reviewer mode or `openspec_review action=self-report` in self mode
- **AND** it does not name `resume` or `dispose`

#### Scenario: An open finding still names dispose

- **WHEN** a directory entry has a blocking execution result and an open finding
- **THEN** the next action is `openspec_review action=dispose review=<entry>`

### Requirement: A blocked draft attempt names resume

When a directory entry's attempt carries a blocked report and no finding is open, the next action SHALL name `openspec_review` with `action: "resume"` and that entry. An unchanged unreported attempt SHALL keep the round's `wait` or `self-report` action.

#### Scenario: A blocked attempt names resume

- **WHEN** the latest directory report is `blocked` and no finding is open
- **THEN** `nextAction` is `openspec_review action=resume review=<entry>`

#### Scenario: An unchanged unreported attempt keeps its wait

- **WHEN** the latest directory attempt has no report and its object hash is unchanged
- **THEN** `nextAction` is the round's `wait` action in reviewer mode or its `self-report` action in self mode
- **AND** it does not name `resume`
