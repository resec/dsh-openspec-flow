# Spec Delta

## MODIFIED Requirements

### Requirement: The review tool follows the enabled reviews

The plugin SHALL register `openspec_review` while the global `reviewEnabled` switch is true. While it is false, an agent's tool catalog SHALL contain no `openspec_review` entry, and no project review file SHALL be read for locking or gating.

#### Scenario: Both reviews are disabled

- **WHEN** the plugin loads with `reviewEnabled` false
- **THEN** the tool catalog contains no `openspec_review`

#### Scenario: The draft review is enabled

- **WHEN** the plugin loads with `reviewEnabled` true
- **THEN** the tool catalog contains `openspec_review` even when a project review file is absent

#### Scenario: Only the apply review is enabled

- **WHEN** the plugin loads with `reviewEnabled` true and a project file whose draft profile is disabled
- **THEN** the tool catalog still contains `openspec_review` because registration reads the global switch

## ADDED Requirements

### Requirement: openspec_review accepts a review configuration path

`openspec_review` SHALL declare an optional `configPath` string parameter naming the project review file used by the first policy lock. A relative value SHALL resolve against the project root. The value SHALL be used when the call writes a policy or fills a missing section, and SHALL be ignored only once the target section is recorded. `openspec_new_change` SHALL NOT accept the parameter.

#### Scenario: The first start names a file

- **WHEN** the first review start passes `configPath`
- **THEN** the policy is locked from that file and records it as the source

#### Scenario: A locked change passes the parameter

- **WHEN** a review call passes `configPath` for a change whose policy records both sections
- **THEN** the call continues and the recorded policy is unchanged

#### Scenario: A draft-only policy passes the parameter

- **WHEN** a review call passes `configPath` for a policy that records no apply section
- **THEN** the missing section is resolved from that file and recorded

#### Scenario: A relative path is passed

- **WHEN** `configPath` is relative
- **THEN** it resolves against the project root

### Requirement: openspec_init writes the default review configuration

`openspec_init` SHALL create `openspec/reviews.json` with the default profiles and entries when the file is absent, SHALL leave an existing file untouched, and SHALL report whether the file was created or already present.

#### Scenario: The file is created

- **WHEN** `openspec_init` runs in a project without the review file
- **THEN** it writes the default directory profile for draft and the default tree profile for apply and reports the file as created

#### Scenario: The file already exists

- **WHEN** `openspec_init` runs in a project that has a review file
- **THEN** it does not modify the file and reports it as present

#### Scenario: The row config disables reviews

- **WHEN** `openspec_init` runs with `reviewEnabled` false
- **THEN** it still writes the default file when absent, because project initialization is independent of the review switch
