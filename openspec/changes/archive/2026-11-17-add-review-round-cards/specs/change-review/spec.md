# Spec Delta: change-review

## ADDED Requirements

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

## MODIFIED Requirements

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

### Requirement: The changer checks the reviewer report without polling

`openspec_review` with `action: "wait"` SHALL NOT poll. It SHALL return `ready` when the latest round has a report or the reviewer is waived, `overdue` at the deadline, and `waiting` otherwise; `waiting` SHALL set `waitState: "waiting"` and tell the changer to end its turn. The result SHALL come from a read after the best-effort session write, which SHALL re-read inside the lock and change only `changerSessionId`. After the result read, the plugin SHALL attempt a second lock acquisition to mark the review-point card of the latest submitted round for the calling session; a failed or contended marker write SHALL be logged and SHALL NOT change the wait result. The deadline SHALL remain `waitMinutes`.

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

## REMOVED Requirements

### Requirement: Extend changes limits with user approval

**Reason**: Round caps are removed; the wait extension remains as the only extension.

**Migration**: Call `openspec_review` with `action: "extend"`, `approvedBy: "user"`, `reason` and `minutes`; a `maxRounds` argument is refused.

### Requirement: Resume refuses a new round while a finding is open

**Reason**: The requirement's text tied the refusal to the removed round cap and carried a cap scenario; the gate is restated without the cap as "Resume requires every finding disposed".

**Migration**: The gate, its error and its non-mutation rules are unchanged; only the round-cap clause and its scenario are gone.
