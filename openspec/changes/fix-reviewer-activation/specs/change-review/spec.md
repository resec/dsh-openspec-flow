# Spec Delta

## ADDED Requirements

### Requirement: Reviewer activation uses the subagent service contract

The plugin SHALL pass the parent agent, prompt, preset, model options, working directory and cancellation signal as top-level fields of the subagent activation request. It SHALL NOT wrap them in a nested request object. It SHALL reject an activation whose caller agent is missing before starting a child.

#### Scenario: An activation carries the caller at the top level

- **WHEN** the plugin starts an independent reviewer
- **THEN** the subagent service receives `parent`, `prompt`, `agentPreset`, `agentOptions` and `signal` as top-level fields

#### Scenario: A missing caller agent is refused

- **WHEN** the changer agent is unavailable at activation time
- **THEN** the call fails before any child is created
