# Spec Delta

## ADDED Requirements

### Requirement: The CI actions declare the Node 24 runtime

The CI workflow SHALL use GitHub Actions releases that declare the Node 24 runtime: `actions/checkout@v7`, `actions/setup-node@v7`, `actions/cache@v6` and `pnpm/action-setup@v6`. The workflow test SHALL assert each of those major versions so a downgrade to a Node 20 release fails the suite.

#### Scenario: The workflow uses Node 24 actions

- **WHEN** the CI workflow runs
- **THEN** every action it uses declares the Node 24 runtime
- **AND** the workflow test asserts the four pinned major versions

#### Scenario: A Node 20 release is reintroduced

- **WHEN** an action reference is changed back to its Node 20 major version
- **THEN** `test/ci-workflow.test.mjs` fails
