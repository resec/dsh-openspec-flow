# Evaluation Harness Delta

## ADDED Requirements

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
