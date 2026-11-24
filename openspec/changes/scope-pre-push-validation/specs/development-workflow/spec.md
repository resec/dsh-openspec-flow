## MODIFIED Requirements

### Requirement: Strict artifact validation gate

A main-only push SHALL validate main specs and archived tasks with warnings as failures, and SHALL proceed only when every active change reports `in-progress`. Any other push SHALL validate every active change, main spec, and archived tasks the same way. Validation SHALL precede the lab scenarios, which SHALL precede `npm run verify`; a validation or lab failure SHALL block the push, and `COVERAGE_SKIP=1` SHALL NOT skip the lab gate.

#### Scenario: Artifacts pass strict validation

- **WHEN** every active change and main spec passes strict validation and every archived change has all tasks checked
- **THEN** the hook continues to the lab gate

#### Scenario: A main-only push ignores an in-progress change

- **WHEN** a push targets only `refs/heads/main` and an active change reports `in-progress`
- **THEN** the hook validates main specs and archived tasks
- **AND** the hook does not validate that active change
- **AND** the hook continues to the lab gate

#### Scenario: A main-only push blocks a complete change

- **WHEN** a push targets only `refs/heads/main` and an active change reports `complete`
- **THEN** the hook exits nonzero before the lab gate
- **AND** it names the change to archive or land

#### Scenario: A main-only push blocks a task-less change

- **WHEN** a push targets only `refs/heads/main` and an active change reports `no-tasks`
- **THEN** the hook exits nonzero before the lab gate
- **AND** it names the task-less change

#### Scenario: A main-only push blocks an unknown status

- **WHEN** a push targets only `refs/heads/main` and an active change reports a status other than `in-progress`, `complete` or `no-tasks`
- **THEN** the hook exits nonzero before the lab gate
- **AND** it names the change and the unrecognized status

#### Scenario: A non-main push validates a complete change

- **WHEN** a push targets a ref other than `refs/heads/main` and its complete active change passes strict validation
- **THEN** the hook runs the full validation
- **AND** it continues to the lab gate

#### Scenario: A mixed push validates every active change

- **WHEN** a push targets `refs/heads/main` and another ref
- **THEN** the hook runs the full validation over every active change

#### Scenario: A warning exists

- **WHEN** a main spec reports a warning, or a non-main push's active change reports a warning
- **THEN** the hook exits nonzero and the push is blocked

#### Scenario: An archived change has unfinished tasks

- **WHEN** an archived change has unchecked tasks
- **THEN** the hook exits nonzero and the push is blocked

#### Scenario: The active-change listing is unreadable

- **WHEN** the main-only gate cannot read the active-change status
- **THEN** the hook exits nonzero before the lab gate

#### Scenario: Coverage is skipped

- **WHEN** `COVERAGE_SKIP=1` is set
- **THEN** strict validation and the lab gate still run before the hook exits

#### Scenario: A verifying stamp skips verification after validation

- **WHEN** strict validation and the lab gate pass and the coverage stamp verifies
- **THEN** the hook skips `npm run verify`
- **AND** strict validation and the lab gate have already run

#### Scenario: An unverified stamp runs verification after validation

- **WHEN** strict validation and the lab gate pass and the coverage stamp does not verify
- **THEN** the hook runs `npm run verify`

#### Scenario: The bundled CLI is unavailable

- **WHEN** the hook cannot execute the bundled OpenSpec CLI
- **THEN** it reports the missing executable and the push is blocked

#### Scenario: Lab scenarios pass before verification

- **WHEN** strict validation passes and `npm run test:lab -- --mock-only` passes
- **THEN** the hook continues to the coverage step

#### Scenario: A lab scenario fails

- **WHEN** a reusable lab scenario fails
- **THEN** the hook exits nonzero before `npm run verify`
- **AND** the push is blocked

#### Scenario: Coverage is skipped but the lab gate runs

- **WHEN** `COVERAGE_SKIP=1` is set and a lab scenario fails
- **THEN** the hook still runs the lab gate
- **AND** the push is blocked
