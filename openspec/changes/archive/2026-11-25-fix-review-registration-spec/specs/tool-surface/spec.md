# Spec Delta

## ADDED Requirements

### Requirement: The review tool follows the enabled reviews

The plugin SHALL register `openspec_review` while the draft review or the apply review is enabled. When both reviews are disabled, an agent's tool catalog SHALL contain no `openspec_review` entry.

#### Scenario: Both reviews are disabled

- **WHEN** the plugin loads with `reviews.draft.enabled` false and `reviews.apply.enabled` false
- **THEN** the tool catalog contains no `openspec_review`

#### Scenario: The draft review is enabled

- **WHEN** the plugin loads with `reviews.draft.enabled` true
- **THEN** the tool catalog contains `openspec_review`

#### Scenario: Only the apply review is enabled

- **WHEN** the plugin loads with `reviews.draft.enabled` false and `reviews.apply.enabled` true
- **THEN** the tool catalog contains `openspec_review`

## REMOVED Requirements

### Requirement: Draft review tool is absent when disabled

**Reason**: The plugin also registers the tool when only the apply review is enabled, so "absent whenever the draft review is disabled" is no longer true.

**Migration**: The tool is now absent only when both reviews are disabled; read "The review tool follows the enabled reviews".
