# change-review Specification Delta

## ADDED Requirements

### Requirement: The reviewer model is locked per change

The policy SHALL carry one concrete reviewer model for draft and one for apply. `source: "inherit"` SHALL resolve to the changer's current provider, model and effort when the policy is locked; an unresolvable inherit SHALL fail the policy write. The concrete model MAY omit `reasoningEffort` when that model exposes no selectable effort, and the reviewer then follows the adapter default. The policy SHALL NOT change when the configuration page is edited later.

#### Scenario: Inherit resolves at lock time

- **WHEN** a new change locks a review with `source: "inherit"`
- **THEN** the policy contains the resolved provider, model and effort

#### Scenario: Inherit cannot resolve

- **WHEN** the changer has no current model at lock time
- **THEN** the change is not created

#### Scenario: The page edits defaults after locking

- **WHEN** the user changes the reviewer model after a change is locked
- **THEN** that change's policy keeps the old model

### Requirement: The reviewer activation uses the locked model

`openspec_review` SHALL pass the locked model as `agentOptions` to the reviewer activation. It SHALL reject an unavailable provider, model or reasoning effort before starting the child.

#### Scenario: The reviewer starts

- **WHEN** a reviewer activation starts for a locked explicit model
- **THEN** `agentOptions` carries that provider, model and effort

#### Scenario: The locked model is unavailable

- **WHEN** the provider or model no longer resolves
- **THEN** the start fails before an activation is created

#### Scenario: An older policy has no model

- **WHEN** a policy written before this change starts a reviewer
- **THEN** the plugin resolves inherit once and records it in the policy
