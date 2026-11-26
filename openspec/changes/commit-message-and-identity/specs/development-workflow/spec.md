# Spec Delta: development-workflow

## ADDED Requirements

### Requirement: Repository documents state the commit conventions

The repository SHALL state in `CONTRIBUTING.md` that every commit message is written in English, and SHALL state the same rule in the `Commit conventions` section of `AGENTS.md`. That section SHALL also state that a commit created in this repository's working tree takes its author and committer from the identity `git config user.name` and `user.email` resolve, that no command-line or environment override is passed, and that no script, hook or CI check enforces either rule.

#### Scenario: The contributor guide states the language rule

- **WHEN** a reader opens step 5 of the `Change-first workflow` in `CONTRIBUTING.md`
- **THEN** it states that the subject and the body are written in English even when the conversation, the change artifacts or an issue are written in another language

#### Scenario: The agent instructions restate the language rule

- **WHEN** a reader opens the `Commit conventions` section of `AGENTS.md`
- **THEN** it states that commit messages are English

#### Scenario: The agent instructions state the identity rule

- **WHEN** a reader opens the `Commit conventions` section of `AGENTS.md`
- **THEN** it states that a commit created in the working tree takes its author and committer from the identity the repository configuration resolves
- **AND** it forbids inventing an identity and passing a command-line or environment override
- **AND** it allows a distinguishable automation identity only when the repository configures and records it

#### Scenario: Neither rule is a gate

- **WHEN** a commit violates either rule
- **THEN** no script, hook or CI check reports it

#### Scenario: Existing history is not retrofitted

- **WHEN** history predates either rule
- **THEN** its messages and authors stay as written
