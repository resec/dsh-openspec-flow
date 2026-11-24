# Spec Delta

## MODIFIED Requirements

### Requirement: openspec_review accepts an explicit apply review base

`openspec_review` SHALL declare an optional `base` string parameter with a non-empty description. The value MAY be a commit, branch or tag reference. Apply `start` and `resume` SHALL pass it to the base resolution; other actions SHALL ignore it. A blank or whitespace-only value SHALL be ignored, except when the caller explicitly passes `baseline: "none"`, where a missing or blank value SHALL fail. The parameter SHALL be part of the registered schema and SHALL NOT be required.

#### Scenario: The schema declares base

- **WHEN** an agent reads the registered `openspec_review` parameter schema
- **THEN** `base` is an optional string with a non-empty description
- **AND** `base` is not listed in `required`

#### Scenario: An explicit base is accepted

- **WHEN** a caller passes `base` to an apply review start or resume
- **THEN** the call is accepted and the base is the passed reference

#### Scenario: A blank base is ignored

- **WHEN** a caller passes a whitespace-only `base` with a baseline other than `none`
- **THEN** the base falls back to the recorded apply base or `git merge-base HEAD refs/remotes/origin/main`

#### Scenario: A blank base with an explicit no-draft baseline fails

- **WHEN** a caller explicitly passes `baseline: "none"` with a whitespace-only or missing `base`
- **THEN** the call fails and names `base` as required

#### Scenario: A blank base on a draft-disabled policy falls back

- **WHEN** the draft policy is disabled, the caller omits `baseline`, and `base` is blank or missing
- **THEN** the base falls back to `git merge-base HEAD refs/remotes/origin/main` as before

#### Scenario: Other actions ignore base

- **WHEN** a caller passes `base` to an action other than apply start or resume
- **THEN** the action behaves as if `base` were absent
