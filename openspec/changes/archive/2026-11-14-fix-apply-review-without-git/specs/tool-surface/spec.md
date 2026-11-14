# Spec Delta

## MODIFIED Requirements

### Requirement: Apply review is exposed through openspec_review

`openspec_review` SHALL accept `review: "apply"` for `start`, `status`, `self-report`, `report`, `dispose`, `waive`, `extend` and `abandon`. The result SHALL name the commit, tree, base tree and readiness. The tool SHALL refuse an apply `start` outside a git repository; `status` is governed by the status requirement below.

#### Scenario: Apply review starts

- **WHEN** an agent calls `openspec_review` with `action: "start"` and `review: "apply"` on a clean commit
- **THEN** the result names the review id, round, commit, tree and base tree

#### Scenario: Apply review is unavailable

- **WHEN** an agent requests an apply review `start` without git
- **THEN** the call fails with an actionable error

#### Scenario: Apply report is submitted

- **WHEN** an agent submits a valid apply report
- **THEN** the report is stored and the status reflects its verdict

## ADDED Requirements

### Requirement: Apply review status reports policy, enabled and available

`openspec_review` with `action: "status"` and `review: "apply"` SHALL report `policy`, `enabled` and `available`. `policy` SHALL be true when the locked policy carries an apply section; `enabled` SHALL reflect that section; `available` SHALL be false without a git repository. For an unavailable, unset or disabled review it SHALL return `ready: false` and the next action instead of failing.

#### Scenario: Status outside git with a new policy

- **WHEN** an agent calls apply status in a project without git whose policy was created by this plugin
- **THEN** the result has `policy: true`, `enabled: false` and `available: false`
- **AND** `reasons` names the missing git repository and `nextAction` is `openspec_archive`

#### Scenario: Status outside git with a legacy enabled policy

- **WHEN** a policy written before this change enables apply review in a project without git
- **THEN** the result has `policy: true`, `enabled: true` and `available: false`
- **AND** `reasons` names the missing git repository and `nextAction` is `openspec_archive`

#### Scenario: Status with a disabled policy

- **WHEN** a git project's change policy disables apply review
- **THEN** the result has `policy: true`, `enabled: false` and `available: true`
- **AND** it does not ask the agent to start the review and names `openspec_archive` as the next action

#### Scenario: Status with an enabled policy

- **WHEN** a git project's change policy enables apply review and the review has not started
- **THEN** the result has `policy: true`, `enabled: true` and `available: true`
- **AND** it names `openspec_review` with `action: "start"` as the next action

#### Scenario: Status with no policy

- **WHEN** a legacy change in a git project has no review policy
- **THEN** the result has `policy: false`, `enabled: false` and `available: true`
- **AND** `reasons` states that the first start locks a policy and `nextAction` is `openspec_review` with `action: "start"`

#### Scenario: Status with a draft-only policy

- **WHEN** a legacy policy carries only a draft section
- **THEN** the result has `policy: false`, `enabled: false` and `available: true`
- **AND** `reasons` states that the first start migrates the apply section and `nextAction` is `openspec_review` with `action: "start"`

#### Scenario: Status outside git with no policy

- **WHEN** a legacy change in a project without git has no review policy
- **THEN** the result has `policy: false`, `enabled: false` and `available: false`
- **AND** `reasons` names the missing git repository and `nextAction` is `openspec_archive`
