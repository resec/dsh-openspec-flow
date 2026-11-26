# development-workflow delta

## ADDED Requirements

### Requirement: A test signals a surviving child only after a readiness line

A test whose child must survive the signal the test sends SHALL wait for a readiness line the child writes after installing its handler, and SHALL NOT substitute a fixed interval, so a slow cold start cannot deliver the signal before the handler exists. A test whose child is not expected to survive the signal is outside this rule.

#### Scenario: A loaded host delays the child's start

- **WHEN** the host is loaded so that the child's cold start outlasts a fixed wait
- **THEN** the test sends the signal only after the child writes its readiness line
- **AND** the child survives the ignored `SIGTERM`

#### Scenario: The child exits before it reports readiness

- **WHEN** the child exits before writing its readiness line
- **THEN** the test fails with a message naming the missing readiness line
