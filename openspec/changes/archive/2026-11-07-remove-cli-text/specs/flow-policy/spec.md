# flow-policy Delta

## ADDED Requirements

### Requirement: The flow rule names only the tools

The registered flow rule SHALL name the `openspec_*` tools and SHALL NOT mention the OpenSpec CLI or a CLI fallback.

#### Scenario: The rule is assembled

- **WHEN** an OpenSpec-project agent's system prompt is assembled
- **THEN** the flow section contains no `CLI` token and no fallback sentence

#### Scenario: The rule text is edited

- **WHEN** a contributor changes `POLICY_TEXT` so that it names the CLI
- **THEN** `node --test test/` fails
