# Spec Delta

## ADDED Requirements

### Requirement: DSH runtime upgrades follow a documented procedure

The repository SHALL document one procedure for moving `engines.dsh` to a new exact DSH runtime and SHALL follow it for every upgrade. The procedure MUST state the compatibility gate, the target version's declared Node floor, the DSH coupling inventory, the ordered edits, the candidate verification, the test matrix, release and rollback.

#### Scenario: An upgrade starts with the target runtime facts

- **WHEN** a maintainer selects a target DSH version
- **THEN** the maintainer records its release notes and compare link
- **AND** confirms the exact version is published on the npm registry
- **AND** records its declared `engines.node` and the Node major its tests require

#### Scenario: Manifest and runtime baseline move together

- **WHEN** the target DSH version declares a different Node floor or major
- **THEN** `engines.dsh` names the target exact version with the `=` prefix
- **AND** `engines.node` equals the declared floor
- **AND** the primary Node major, `coverage.config.json` and the `project-invariants` baseline change in the same change

#### Scenario: The candidate runtime is verified before release

- **WHEN** the manifest names the target runtime
- **THEN** an isolated install of that runtime composes the plugin bundle without a skipped-bundle diagnostic
- **AND** a live boot of that runtime registers the plugin's tools, skills and policy
- **AND** the plugin test suite and coverage gate pass

#### Scenario: A rejected upgrade is rolled back

- **WHEN** the candidate runtime fails a check or a live smoke
- **THEN** the manifest, documentation and installed runtime return to the previous exact version
- **AND** the same checks pass on the restored version

#### Scenario: A version exemption does not replace verification

- **WHEN** a maintainer considers a profile version exemption for the plugin
- **THEN** the exemption is treated as a local diagnostic only
- **AND** the repository does not ship or record it as evidence of compatibility

#### Scenario: The guide carries no upgrade record

- **WHEN** a maintainer finishes an upgrade and updates the guide
- **THEN** the guide's content remains the procedure and the current pin
- **AND** no section records that upgrade's version-to-version changes, measurements or outcomes
- **AND** the upgrade's evidence lives in the change artifacts and commit history
