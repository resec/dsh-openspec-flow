# Spec Delta

## ADDED Requirements

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
