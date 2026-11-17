# Spec Delta: tool-surface

## ADDED Requirements

### Requirement: openspec_review accepts an explicit apply review base

`openspec_review` SHALL declare an optional `base` string parameter with a non-empty description. The value MAY be a commit, branch or tag reference. Apply `start` and `resume` SHALL pass it to the base resolution; other actions SHALL ignore it. A blank or whitespace-only value SHALL be ignored. The parameter SHALL be part of the registered schema and SHALL NOT be required.

#### Scenario: The schema declares base

- **WHEN** an agent reads the registered `openspec_review` parameter schema
- **THEN** `base` is an optional string with a non-empty description
- **AND** `base` is not listed in `required`

#### Scenario: An explicit base is accepted

- **WHEN** a caller passes `base` to an apply review start or resume
- **THEN** the call is accepted and the base is the passed reference

#### Scenario: A blank base is ignored

- **WHEN** a caller passes a whitespace-only `base`
- **THEN** the base falls back to the recorded apply base or `git merge-base HEAD origin/main`

#### Scenario: Other actions ignore base

- **WHEN** a caller passes `base` to an action other than apply start or resume
- **THEN** the action behaves as if `base` were absent
