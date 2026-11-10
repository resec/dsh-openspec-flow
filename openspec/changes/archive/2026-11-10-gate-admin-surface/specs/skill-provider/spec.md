# Spec Delta: skill-provider

## ADDED Requirements

### Requirement: Packaged skills belong to the core block

All five packaged workflow skills SHALL stay in the model catalog and the user-facing command list whether or not the management block is open. No packaged skill SHALL be gated by that block.

#### Scenario: The block is closed

- **WHEN** a consumer lists the session skill catalog with the management block closed
- **THEN** all five packaged skills are present

#### Scenario: The block is open

- **WHEN** the user opens the management block
- **THEN** the skill catalog is unchanged
