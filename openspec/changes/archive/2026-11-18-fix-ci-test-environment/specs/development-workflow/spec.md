# development-workflow Delta

## ADDED Requirements

### Requirement: Review fixture data is tracked

The repository SHALL keep the probe project copied by the review fixtures in tracked files under `test/fixtures/`. `test/review-fixtures.mjs` SHALL be the single source of the probe path, and test files SHALL import that path instead of recomputing it. Every review suite SHALL resolve the project inside the repository, so a clean checkout runs without repository-external files or a local setup step.

#### Scenario: A clean checkout runs the review suite

- **WHEN** the review suite runs on a fresh checkout
- **THEN** its probe project is present under `test/fixtures/probe/openspec`
- **AND** no fixture path resolves outside the repository

#### Scenario: A test recomputes the probe path

- **WHEN** a top-level test module defines its own probe path instead of importing the shared one
- **THEN** the repository layout test fails and names the module

#### Scenario: A fixture path leaves the repository

- **WHEN** the shared probe path resolves outside the repository root
- **THEN** the repository layout test fails and names the fixture path
