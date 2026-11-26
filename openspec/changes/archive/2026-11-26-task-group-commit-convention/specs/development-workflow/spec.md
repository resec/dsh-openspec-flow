# Spec Delta: development-workflow

## ADDED Requirements

### Requirement: Apply commits follow task groups

The repository SHALL require each numbered top-level `tasks.md` group that changes files to own at least one commit carrying only its changes, so no commit combines two groups. Subtasks of one group MAY share it; a group that only verifies SHALL leave no implementation commit. The rule SHALL cover implementation commits before the first apply review; a review round SHALL keep one finding per commit. `AGENTS.md` SHALL state the rule and `openspec/config.yaml` SHALL carry it as apply guidance.

#### Scenario: A changing group owns its commit

- **WHEN** the implementation completes a numbered group in `tasks.md` and the group changed files
- **THEN** the group owns at least one commit
- **AND** that commit carries only the group's changes

#### Scenario: Subtasks share a commit

- **WHEN** one group's subtasks change files
- **THEN** the group MAY land them in a single commit
- **AND** that commit carries the whole group's changes

#### Scenario: A commit combines two groups

- **WHEN** a commit carries changed files from two numbered groups
- **THEN** it satisfies neither group's requirement
- **AND** each group still needs its own commit

#### Scenario: A verification-only group leaves no implementation commit

- **WHEN** a group runs checks without changing a file
- **THEN** it leaves no implementation commit

#### Scenario: Checkbox bookkeeping is not a group commit

- **WHEN** a commit records only checked boxes in `tasks.md`
- **THEN** it is flow bookkeeping and belongs to no group
- **AND** a group that only verifies still owns no group commit

#### Scenario: A review round keeps its own unit

- **WHEN** an apply review round reports findings
- **THEN** each fix commit answers one finding
- **AND** the task-group rule does not split it

#### Scenario: A missing group commit keeps the first review closed

- **WHEN** the log read before the first apply review finds a changing group without its own commit
- **THEN** the first apply review does not open
- **AND** the implementer commits the group's remaining files, or splits the apply branch when its edits went into another commit

#### Scenario: AGENTS.md carries the operative rule

- **WHEN** a reader opens the `Commit conventions` section of `AGENTS.md`
- **THEN** it states the group rule, the attribution of a commit to its group, the subtask allowance, the verification-only exemption and the finding-scoped boundary
- **AND** it states that no script or CI check enforces the rule

#### Scenario: The apply tool surfaces the guidance

- **WHEN** `openspec_apply_next` runs in this repository
- **THEN** its `guidance` carries the group rule from `openspec/config.yaml`
