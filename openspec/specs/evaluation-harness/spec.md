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

### Requirement: Isolated harness home

The harness SHALL run every matrix with a private `DSH_HOME` and `DSH_AGENTS_HOME` under its evaluation root, SHALL create the headless profile and copy stored credentials with owner-only permissions there, and SHALL remove both roots after the matrix unless the operator explicitly keeps them.

#### Scenario: A matrix starts

- **WHEN** an executable matrix begins
- **THEN** the private home contains the headless profile and a mode-restricted credentials copy, and every child `dsh` process receives both private roots

#### Scenario: Credentials are missing

- **WHEN** the source home has no credentials file
- **THEN** the harness stops before any model call and names the missing file

#### Scenario: A matrix finishes

- **WHEN** the matrix succeeds or fails after creating the private home
- **THEN** both private roots are removed and the report plus copied session logs remain

#### Scenario: The default home is not written

- **WHEN** a matrix runs
- **THEN** the harness writes no profile, session or log under the default `~/.dsh`

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

### Requirement: Configurable plugin source

The harness SHALL resolve the tested plugin without assuming its own parent directory is the plugin repository. The resolution order is `--plugin-root`, `EVAL_PLUGIN_ROOT`, a sibling `../dsh-openspec-flow` checkout, then the current repository root; an explicit `--clone` MAY fetch the repository when no local root resolves. Every resolved root MUST be validated by its package name before use.

#### Scenario: An explicit plugin root is used

- **WHEN** `--plugin-root` names a directory whose `package.json` declares the plugin
- **THEN** the harness uses that directory for the generated profile link, fixture preparation and skill installation

#### Scenario: The environment names the plugin root

- **WHEN** no `--plugin-root` is given and `EVAL_PLUGIN_ROOT` names a valid plugin checkout
- **THEN** the harness uses that checkout and reports it as the plugin source

#### Scenario: A sibling checkout is discovered

- **WHEN** no flag or environment variable is set and a sibling `../dsh-openspec-flow` checkout exists
- **THEN** the harness uses that checkout instead of its own parent directory

#### Scenario: The clone fallback runs

- **WHEN** no local plugin root resolves and `--clone` is set
- **THEN** the harness clones the plugin repository into `eval/.plugin/`, checks out `--plugin-ref`, and uses the clone

#### Scenario: The resolved root is not the plugin

- **WHEN** the resolved directory has no `package.json` naming the plugin
- **THEN** the harness stops before any model call and names the invalid path

### Requirement: Plugin provenance in run records

Every run record and report SHALL identify the tested plugin by its root path, package version, git commit and dirty state. A root that is not a git checkout SHALL leave the commit and dirty fields empty rather than fail the run.

#### Scenario: A run is recorded

- **WHEN** a matrix cell finishes and its run record is written
- **THEN** the record names the plugin root, version, commit and whether the checkout was dirty

#### Scenario: The plugin root has no git metadata

- **WHEN** the resolved plugin root is not a git checkout
- **THEN** the run record still carries the root and package version, and the commit and dirty fields are empty

### Requirement: Harness-owned CLI dependency

The harness SHALL resolve the pinned OpenSpec CLI from its own dependency tree, not from the tested plugin's `node_modules`, so a plugin checkout without installed dependencies can still be measured.

#### Scenario: The plugin root has no installed CLI

- **WHEN** the tested plugin directory has no `node_modules` but the harness dependency tree contains the pinned CLI
- **THEN** preflight and the strict validation gate still locate the CLI
