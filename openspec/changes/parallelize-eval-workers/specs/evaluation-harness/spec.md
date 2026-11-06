# Evaluation Harness Delta

## ADDED Requirements

### Requirement: Concurrent matrix workers

The harness SHALL run up to a configured number of matrix cells concurrently, SHALL give each worker its own `DSH_HOME`, `DSH_AGENTS_HOME` and generated headless profile, and SHALL NOT share a profile file between workers. It SHALL default to one worker, record the worker and wall time for each run, and remove every worker home after the matrix.

#### Scenario: Default concurrency

- **WHEN** no concurrency is configured
- **THEN** one worker runs the cells in the existing order with one private home

#### Scenario: Concurrent workers start

- **WHEN** concurrency is greater than one
- **THEN** each worker has a distinct home, profile and credentials copy, and receives its own home variables

#### Scenario: A worker preflight fails

- **WHEN** any worker's profile preflight fails
- **THEN** the matrix stops before any model call and removes every worker home already created

#### Scenario: The matrix finishes

- **WHEN** every worker finishes
- **THEN** all worker homes are removed and the report records each run's worker and wall time
