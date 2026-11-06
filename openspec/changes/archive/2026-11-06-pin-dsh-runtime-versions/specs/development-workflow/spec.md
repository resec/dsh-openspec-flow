# Development Workflow Delta

## ADDED Requirements

### Requirement: DSH runtime version alignment

The repository SHALL pin `engines.dsh` to the exact DSH runtime the plugin is verified against and SHALL set `engines.node` to the same lower bound declared by that DSH version.

#### Scenario: Manifest declares a DSH runtime

- **WHEN** a contributor edits `package.json` to declare the target DSH runtime
- **THEN** `engines.dsh` names one exact version with the `=` prefix
- **AND** `engines.node` uses the same lower bound as that DSH version's `engines.node`

#### Scenario: DSH dependency upgrade

- **WHEN** the targeted DSH version changes
- **THEN** the contributor reads the new DSH version's `engines.node` before editing `package.json`
- **AND** `engines.node` is re-aligned to that lower bound
- **AND** `engines.dsh` is updated to the new exact version
- **AND** the manifest passes the DSH compatibility check for that runtime

#### Scenario: Runtime mismatch is rejected

- **WHEN** the running DSH version differs from `engines.dsh`
- **THEN** DSH's install or startup check rejects the plugin unless the profile holds an exact-version exemption
