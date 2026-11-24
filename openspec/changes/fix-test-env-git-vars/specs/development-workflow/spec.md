# Spec Delta

## ADDED Requirements

### Requirement: Test runs drop the environment git injects

The plain, scoped and coverage test entrypoints SHALL NOT pass the variables git injects into a process it starts (`GIT_DIR`, `GIT_WORK_TREE`, `GIT_INDEX_FILE`, `GIT_OBJECT_DIRECTORY`, `GIT_COMMON_DIR`, `GIT_PREFIX`, `GIT_ALTERNATE_OBJECT_DIRECTORIES`) to the test process, and SHALL pass other variables such as `GIT_CONFIG_GLOBAL` through. A fixture helper that runs `git init` SHALL fail, naming the fixture root, when the fixture root holds no repository of its own afterwards.

#### Scenario: The suite runs from a hook in a linked worktree

- **WHEN** a `pre-push` hook in a linked worktree runs the verification entrypoint
- **THEN** the test process receives none of the git-injected variables
- **AND** the hosting repository's references and configuration are unchanged

#### Scenario: A fixture root gets no repository of its own

- **WHEN** a test bypasses the entrypoints with `GIT_DIR` pointing at another repository and a fixture helper runs `git init`
- **THEN** the fixture registration fails and the message names the fixture root
