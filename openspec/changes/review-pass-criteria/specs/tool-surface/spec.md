# Spec Delta

## MODIFIED Requirements

### Requirement: The reviewer reads finding status

`openspec_reviewer` `read` with `target: "findings"` SHALL return each recorded finding's id, severity, status, title, first round, verification round and last verification, plus each round's verdict and whether a report exists. `status` SHALL use the full lifecycle, including `verified-deferred` and `verified-rejected`. The read SHALL NOT change the review.

#### Scenario: Reviewer reads the finding state

- **WHEN** the reviewer calls `read` with `target: "findings"`
- **THEN** the tool returns every recorded finding's id, severity, status, title, first round, verification round and last verification
- **AND** it returns each round's verdict and whether a report exists

#### Scenario: The finding read does not write

- **WHEN** the reviewer reads `target: "findings"`
- **THEN** the review record's bytes are unchanged

#### Scenario: A verified deferred finding is reported

- **WHEN** a recorded finding has the terminal status `verified-deferred` or `verified-rejected`
- **THEN** the read returns that status and its verification round

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

#### Scenario: The default profile states the pass criteria

- **WHEN** the generated default file is read
- **THEN** each profile records the default pass criteria and both disposition switches explicitly

## ADDED Requirements

### Requirement: Review status counts verified dispositions

The `findings` object of every `openspec_review` result SHALL count `verifiedDeferred` and `verifiedRejected` beside the existing status counts, and its output schema SHALL declare both. `blocking` SHALL count unresolved findings at or above the entry's pass criteria.

#### Scenario: The status reports the new counts

- **WHEN** an `openspec_review` result carries a `findings` summary for a record with `verified-deferred` and `verified-rejected` findings
- **THEN** the summary carries `verifiedDeferred` and `verifiedRejected` counts beside the existing counts

#### Scenario: The blocking count follows the pass criteria

- **WHEN** the entry's `passCriteria` is `minor` and a `minor` finding is unresolved
- **THEN** the summary's `blocking` count includes that finding

#### Scenario: The output schema declares both counts

- **WHEN** the registered `openspec_review` output schema is inspected
- **THEN** the `findings` object declares `verifiedDeferred` and `verifiedRejected`

### Requirement: Disposition refusals follow the pass criteria

`openspec_review` with `action: "dispose"` SHALL refuse a `deferred` or `rejected` status when the finding is at or above the pass criteria or the matching profile switch is false, and SHALL leave the record unchanged. The refusal SHALL name the finding, the threshold or switch, and the allowed statuses.

#### Scenario: An in-threshold deferred disposition is refused

- **WHEN** a caller disposes an in-threshold finding as `deferred` and `allowDeferred` is true
- **THEN** the call fails and the record is unchanged
- **AND** the error names the finding, the pass criteria and the allowed statuses

#### Scenario: A closed switch refuses a below-threshold disposition

- **WHEN** `allowDeferred` is false and a caller disposes a below-threshold finding as `deferred`
- **THEN** the call fails and names the closed switch

#### Scenario: A below-threshold rejected disposition is accepted

- **WHEN** a caller rejects a below-threshold finding with evidence and `allowRejected` is true
- **THEN** the call succeeds and the finding becomes `rejected`

#### Scenario: A refused batch leaves every finding unchanged

- **WHEN** a batch contains one refused disposition and one valid disposition
- **THEN** the call fails and no finding changes
