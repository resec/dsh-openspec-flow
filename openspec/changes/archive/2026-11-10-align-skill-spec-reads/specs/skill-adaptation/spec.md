# Skill spec-read alignment delta

## ADDED Requirements

### Requirement: Propose skill reads existing specs before proposing scope

The `openspec-propose` skill SHALL instruct the agent to inventory capabilities with `openspec_list` (`specs: true`), take a filtered overview with `openspec_show` (`type: "spec"`, `noScenarios: true`), and read each relevant capability in full with `openspec_show` (`type: "spec"`) before stating the change scope. It SHALL require the agent to surface a conflict with an existing requirement and ask instead of deciding it silently.

#### Scenario: Proposal scope is prepared

- **WHEN** the propose skill is loaded for a new change
- **THEN** it tells the agent to list capabilities, read each relevant spec in full, and name the capability and requirement behind each conclusion
- **AND** it tells the agent to surface a conflict with an existing requirement and ask

### Requirement: Explore skill reads relevant specs in full

The `openspec-explore` skill SHALL state that a filtered `openspec_show` read is only an overview and SHALL require a full read of every relevant spec, including scenarios, before the agent says what a capability covers or what should change. It SHALL keep the read bounded to what the question needs.

#### Scenario: Capability coverage is assessed

- **WHEN** the explore skill is used to assess what the project already covers
- **THEN** it tells the agent to start with the filtered read and then read every relevant spec in full, including scenarios
