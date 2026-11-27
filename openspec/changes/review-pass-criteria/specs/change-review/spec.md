# Spec Delta

## MODIFIED Requirements

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
- **THEN** its base is the beforeApply entry's apply base commit
- **AND** the diff covers the implementation and any plan change after the seal

#### Scenario: A pr entry uses the beforeApply baseline

- **WHEN** a `pr` tree entry starts without `baseline` and the `beforeApply` entry has a ready record
- **THEN** the `pr` entry records the draft baseline and reads that record

#### Scenario: An extra round owns the ready tree

- **WHEN** the marker is present and the latest extra round passes
- **THEN** readiness compares the tree against that extra round's `treeSha`

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

## ADDED Requirements

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
