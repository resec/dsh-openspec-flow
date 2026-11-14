# Spec Delta

## ADDED Requirements

### Requirement: The draft brief is neutral about authorship

The draft brief SHALL use one opening for both review modes that asks for an adversarial review and does not assert who wrote the planning material. It SHALL NOT address the reader as the changer or state that the reader wrote the material.

#### Scenario: Changer reads the self-review brief
- **WHEN** a draft review with `reviewers: 0` returns the brief to the changer
- **THEN** the opening asks for an adversarial review
- **AND** it does not claim the changer wrote the material

#### Scenario: Independent reviewer reads the brief
- **WHEN** a draft review with `reviewers: 1` starts an independent reviewer and the reviewer reads the brief
- **THEN** the opening asks for an adversarial review
- **AND** it does not claim the reviewer wrote the material
