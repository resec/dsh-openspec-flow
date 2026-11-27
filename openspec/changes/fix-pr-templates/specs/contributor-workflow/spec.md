# Spec Delta

## ADDED Requirements

### Requirement: Contribution templates are covered by tests

The test suite SHALL read the pull request template and both issue templates. It SHALL fail when a template is missing, when the pull request template lacks one of its six body sections or the exactly-one-active-change instruction, or when a template names an `npm run` script that `package.json` does not define.

#### Scenario: A template reads a stale command

- **WHEN** a template lists an `npm run` command that `package.json` scripts do not define
- **THEN** the template test fails and names the command and the template

#### Scenario: The pull request template drifts from the change gate

- **WHEN** the pull request template loses a body section or no longer requires exactly one active change
- **THEN** the template test fails and names the missing section or instruction

#### Scenario: A template is removed

- **WHEN** one of the three templates is absent
- **THEN** the template test fails and names the missing file
