## MODIFIED Requirements

### Requirement: Review records live under the OpenSpec review root

The plugin SHALL store review records at `openspec/.review/<store>#<change>/`, using `local#<change>` when no store is selected. It SHALL ensure `openspec/.gitignore` contains `.review/` unless `git check-ignore` already accepts the review directory. Before a record is written, the plugin SHALL verify that `git check-ignore` accepts the record path when the project is a git repository; a project without git SHALL still use the same path.

#### Scenario: First review creates the record root

- **WHEN** a review starts for a git project whose review directory no rule ignores
- **THEN** the plugin creates the directory and adds `.review/` to `openspec/.gitignore`

#### Scenario: A repository rule already ignores the review directory

- **WHEN** `git check-ignore` already accepts the review directory
- **THEN** the plugin creates the directory and writes no `openspec/.gitignore`

#### Scenario: Record path is ignored

- **WHEN** the project is a git repository and the record path is not ignored
- **THEN** the review start fails with an actionable error instead of writing a tracked record

#### Scenario: The nested ignore file already covers the review directory

- **WHEN** `openspec/.gitignore` already contains the `.review/` line
- **THEN** the plugin writes no file

#### Scenario: Non-git projects keep the write behavior

- **WHEN** the project has no git repository
- **THEN** the plugin keeps writing the ignore line

#### Scenario: A failed ignore check is conservative

- **WHEN** the git ignore check fails for a reason other than a clean miss
- **THEN** the plugin writes the ignore line instead of skipping it

#### Scenario: Store-scoped change

- **WHEN** a change belongs to a registered store
- **THEN** its review directory is named `<store>#<change>`

## ADDED Requirements

### Requirement: Standalone apply review has no draft baseline

An apply review started with `baseline: "none"` SHALL NOT require a draft record, intent, plan-drift check or plan-change waiver. When the caller explicitly passes `baseline: "none"`, it SHALL require an explicit base and refuse a change that already has a draft record; the record SHALL store `none`. It SHALL reuse the apply contract. When the draft policy is disabled, an omitted baseline SHALL record `none` and keep the existing base fallback; otherwise the default keeps the draft gate.

#### Scenario: A committed branch starts without a draft record

- **WHEN** a change has no draft review record and a clean committed tree, and the caller starts an apply review with `baseline: "none"` and an explicit base
- **THEN** the round opens, records the commit, tree and base, and records `baseline: "none"`

#### Scenario: The explicit base owns the diff scope

- **WHEN** a no-draft apply review starts with a base commit
- **THEN** the brief names that base as the explicit source and the diff starts at its tree

#### Scenario: No base is refused

- **WHEN** a caller explicitly passes `baseline: "none"` without a non-empty base
- **THEN** the call fails before writing a round and asks for `base`

#### Scenario: A draft-disabled omitted baseline keeps the base fallback

- **WHEN** the draft policy is disabled, the caller omits `baseline`, and no base is passed
- **THEN** the review opens and the base falls back to `git merge-base HEAD origin/main`

#### Scenario: An existing draft record refuses the no-draft baseline

- **WHEN** a change already has a draft review record and the caller explicitly starts an apply review with `baseline: "none"`
- **THEN** the call fails before writing a round and names the draft review and the plan-change waiver path

#### Scenario: A draft-disabled policy records the none baseline

- **WHEN** a change's policy disables the draft review and the caller starts an apply review with an omitted baseline
- **THEN** the apply review opens and records `baseline: "none"`

#### Scenario: Plan drift checks are skipped

- **WHEN** a no-draft apply review runs after the change artifacts were committed on the branch
- **THEN** the review does not ask for a plan-change waiver and does not report draft drift

#### Scenario: Readiness still requires a report

- **WHEN** a no-draft apply review opens a round without a report
- **THEN** the review is not ready and the next action is the report action for its mode

#### Scenario: The default with an enabled draft policy still requires a draft

- **WHEN** the draft policy is enabled and a caller starts an apply review without `baseline` for a change with no draft review record
- **THEN** the call fails with the existing draft requirement
