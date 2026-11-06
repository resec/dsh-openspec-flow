# Spec Delta

## REMOVED Requirements

### Requirement: Separate plugin and eval scopes
**Reason**: The eval scope moved to the `dsh-openspec-flow-eval` repository; this gate measures only the plugin.
**Migration**: Measure eval coverage with the evaluation harness repository; this gate keeps the plugin scope.

## ADDED Requirements

### Requirement: Plugin coverage scope

The gate SHALL evaluate a single plugin scope that includes `index.js` and `lib/**/*.js`. Test files and `node_modules` SHALL be excluded.

#### Scenario: The scope is reported

- **WHEN** the gate evaluates a completed run
- **THEN** the report shows line, branch and function figures for the plugin scope

#### Scenario: An in-scope source file has no coverage record

- **WHEN** a file in the plugin scope is absent from lcov
- **THEN** the gate reports a missing-coverage violation for that file
