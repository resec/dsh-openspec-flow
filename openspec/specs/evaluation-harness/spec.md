# evaluation-harness Specification

## Purpose
Defines how the repository measures the real-model cost, friction and correctness of the official OpenSpec workflow against this plugin under identical conditions.

## Requirements

### Requirement: Two-arm comparison isolation

The harness SHALL run both arms from the same fixture snapshot, request text, model, reasoning effort and permission policy, differing only in the OpenSpec skills and tool surface under test.

#### Scenario: A matrix cell is prepared

- **WHEN** the harness prepares a fixture and arm
- **THEN** it records the fixture commit, request hash, model, reasoning effort and patch set for both arms

#### Scenario: Arms drift

- **WHEN** the recorded fixture, request, model or patch set differs between arms
- **THEN** the harness rejects the run before any model call

### Requirement: Scripted full-flow rounds

The harness SHALL drive one session through the full propose, apply and archive flow and SHALL resume that session with a scripted confirmation only at a known gate.

#### Scenario: The agent waits before creating the change

- **WHEN** the first round ends without a change directory
- **THEN** the harness resumes the session with the creation confirmation

#### Scenario: The change exists but tasks remain

- **WHEN** the change directory exists and its tasks are not all checked
- **THEN** the harness resumes the session with the apply confirmation

#### Scenario: Work is complete but not archived

- **WHEN** every task is checked and no archive directory exists
- **THEN** the harness resumes the session with the archive request

#### Scenario: The agent skips a gate

- **WHEN** a round already satisfies a later stage
- **THEN** the harness advances to the next missing stage instead of resending the satisfied one

#### Scenario: The run stops advancing

- **WHEN** no stage advances for two consecutive rounds
- **THEN** the run is marked stalled and the harness stops resuming

### Requirement: Fixture provenance and preparation

The harness SHALL prepare every fixture deterministically from a pinned source and SHALL keep the target change artifacts and hidden acceptance out of the fixture until verification.

#### Scenario: A git-history fixture is prepared

- **WHEN** the harness prepares a real fixture
- **THEN** its tree comes from the pinned base commit and the target change directory is absent

#### Scenario: A run starts

- **WHEN** the model receives its first request
- **THEN** the hidden acceptance files are not present in the fixture

#### Scenario: A synthetic fixture is copied

- **WHEN** the harness copies the synthetic fixture
- **THEN** the copy contains no target change artifacts and has a fixed initial commit

### Requirement: Token accounting

The harness SHALL derive token figures from provider-reported usage on each assistant message and SHALL report uncached input, cache reads, cache writes and output separately.

#### Scenario: A run completes

- **WHEN** the run finishes
- **THEN** the report shows usage totals, the first request prompt, the peak prompt and per-round usage

#### Scenario: Usage is missing

- **WHEN** an assistant message has no usage
- **THEN** the run is marked incomplete and the missing step is named

### Requirement: Friction accounting

The harness SHALL report a friction vector without collapsing it into a single score, and SHALL exclude known confirmation gates from the unexpected-intervention count.

#### Scenario: A run completes

- **WHEN** the run finishes
- **THEN** steps, tool calls by name, CLI calls, result bytes, failed results, retries, compactions and wall time are recorded

#### Scenario: A confirmation round is classified

- **WHEN** a round is triggered by a scripted confirmation
- **THEN** it is counted as expected and not as friction

#### Scenario: The agent asks an unexpected question

- **WHEN** the agent asks for input outside a known gate
- **THEN** the harness counts it as friction

### Requirement: Correctness gating

The harness SHALL pass a run only when the fixture tests, hidden acceptance, strict OpenSpec validation, task checkboxes and archive all succeed.

#### Scenario: All gates pass

- **WHEN** every gate exits successfully
- **THEN** the run is marked valid

#### Scenario: A gate fails

- **WHEN** any gate fails
- **THEN** the run is retained and marked invalid with the failing gate named

### Requirement: Reporting

The harness SHALL write one JSON record per run and a Markdown report with per-run rows and aggregate comparisons.

#### Scenario: A matrix finishes

- **WHEN** every requested run has finished
- **THEN** the report contains per-run and aggregate sections plus the artifact paths

#### Scenario: Variance dominates

- **WHEN** arm variance exceeds the between-arm difference
- **THEN** the report labels the result indistinguishable rather than reporting a saving

### Requirement: Manual execution and safety limits

The harness SHALL require an explicit execute flag, a wall-clock timeout and a run budget, and SHALL disable subagent tools while leaving web tools enabled.

#### Scenario: Invoked without execute

- **WHEN** the harness runs without the execute flag
- **THEN** it prints the planned matrix and makes no model call

#### Scenario: A limit is hit

- **WHEN** the timeout or budget is reached
- **THEN** the run aborts and retains its artifacts

#### Scenario: The session header is recorded

- **WHEN** a run's tool surface is inspected
- **THEN** no subagent tool is present and the web tools are present

### Requirement: Offline-testable logic

The harness SHALL expose its flow, metrics, fixture and report logic to `node --test` through an injected fake runner, without calling a real model.

#### Scenario: The test suite runs

- **WHEN** `npm run test:eval` runs
- **THEN** no dsh process or provider call is made

#### Scenario: A fake round is supplied

- **WHEN** a test injects a fake round transcript
- **THEN** the same metrics and stage transitions are produced
