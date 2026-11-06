# Evaluation Harness Delta

## MODIFIED Requirements

### Requirement: Token accounting

The harness SHALL derive token figures from provider-reported usage on each assistant message and SHALL report total, work, confirmation-round and confirmation-acknowledgment tokens separately. Work tokens SHALL subtract only the steps before the first tool call in a confirmation round, never the whole round.

#### Scenario: A run completes

- **WHEN** the run finishes
- **THEN** the report shows usage totals, the first request prompt, the peak prompt and per-round usage

#### Scenario: A confirmation round starts with a tool call

- **WHEN** the first step of a confirmation round calls a tool
- **THEN** that round contributes zero acknowledgment tokens and all of its usage counts as work

#### Scenario: A confirmation round starts with an acknowledgment

- **WHEN** a confirmation round has one or more text-only steps before its first tool call
- **THEN** only those steps' usage counts as acknowledgment and the remaining steps count as work

#### Scenario: Usage is missing

- **WHEN** an assistant message has no usage
- **THEN** the run is marked incomplete and the missing step is named
