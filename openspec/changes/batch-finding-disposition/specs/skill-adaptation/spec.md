# Spec Delta

## ADDED Requirements

### Requirement: Review skills dispose findings in one batch

The propose and apply skills SHALL tell the agent to pass every remaining finding disposition in one `dispositions` call for `dispose` or a finding `waive`, and SHALL NOT direct one call per finding. They SHALL keep the single `id` form available for one finding. The apply skill SHALL keep a plan-change `waive` on its `files` form.

#### Scenario: Propose skill names the batch

- **WHEN** the propose skill reaches finding dispositions
- **THEN** it tells the agent to pass all remaining dispositions in one call

#### Scenario: Apply skill names the batch

- **WHEN** the apply skill reaches finding dispositions
- **THEN** it tells the agent to pass all remaining dispositions in one call

#### Scenario: A single finding stays valid

- **WHEN** only one finding needs a disposition
- **THEN** the skill allows the single `id` form

#### Scenario: Plan-change waiver stays on files

- **WHEN** the apply skill describes a plan change during apply
- **THEN** it records the waiver with `files` and not `dispositions`
