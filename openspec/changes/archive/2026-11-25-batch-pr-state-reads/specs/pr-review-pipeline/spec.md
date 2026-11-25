# Spec Delta: pr-review-pipeline

## ADDED Requirements

### Requirement: Batched cleanup state reads

`state --cleanup` SHALL read the state of every tracked pull request and local owner entry in batches of at most 100 numbers and SHALL decide removals from them. It SHALL take the repository from the origin remote and read each number individually when that remote names no GitHub repository. A non-transient batch failure SHALL be re-read one number at a time; a transient one SHALL be reported after its attempts, not repeated per number.

#### Scenario: One request for a large tracked set

- **WHEN** a cleanup run needs the state of 88 tracked and local numbers
- **THEN** it issues one batched state request and no per-number read

#### Scenario: Batched and per-number reads agree

- **WHEN** a pull request is evaluated once from a batched read and once from its own read
- **THEN** cleanup reaches the same removal decision and the same retained report

#### Scenario: A failed batch falls back to per-number reads

- **WHEN** a batched read fails for a reason other than a transient network failure
- **THEN** every number in that batch is read individually and its decision is reported

#### Scenario: A transient batch failure is not repeated per number

- **WHEN** a batched read fails with a transient network error on every attempt
- **THEN** cleanup reports the failure and issues no per-number read

#### Scenario: A number missing from the batch result

- **WHEN** a batched result carries no node for one number
- **THEN** cleanup reads that number individually

#### Scenario: A missing number that cannot be read

- **WHEN** the individual read of a missing number fails after its attempts
- **THEN** the command fails and reports that number

#### Scenario: Origin remote without a GitHub repository

- **WHEN** the origin remote names no GitHub repository
- **THEN** cleanup reads every number individually and reports the same removed and retained entries

#### Scenario: Local entries share the batched read

- **WHEN** a local owner entry needs a state decision
- **THEN** cleanup issues no separate request for it
