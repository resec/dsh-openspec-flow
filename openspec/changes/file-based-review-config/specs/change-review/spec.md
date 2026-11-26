# Spec Delta

## MODIFIED Requirements

### Requirement: Review policy is locked when a change is created

The plugin SHALL resolve and write the review policy before `openspec_new_change` creates a change, from the project review file, unless `reviewEnabled` is false. The policy SHALL carry the draft review switch, reviewer count and wait cap. A file change made after the policy is written SHALL NOT alter that change's review behavior. A failed policy write SHALL leave no change directory.

#### Scenario: A new change locks its policy

- **WHEN** the user creates a change in a project whose review file is valid
- **THEN** the change's review directory contains `policy.json` with the resolved draft review settings
- **AND** a later file edit does not alter that file

#### Scenario: Policy write fails

- **WHEN** the plugin cannot write the policy file
- **THEN** `openspec_new_change` fails and creates no change directory

#### Scenario: A change created outside the tool is locked on first start

- **WHEN** a change has no policy and the first `openspec_review` start runs
- **THEN** the plugin writes the policy from the project review file and continues

#### Scenario: The review switch is off

- **WHEN** `reviewEnabled` is false and a change is created
- **THEN** no policy is written

### Requirement: Apply review is gated by its own policy

The apply review SHALL be enabled by the change policy and SHALL use its own wait limit. It SHALL be unavailable when the policy disables it or when the project has no git. When the project has no git repository, policy creation SHALL lock the apply review disabled even when the project review file enables it.

#### Scenario: Policy disables apply review

- **WHEN** the change policy disables apply review
- **THEN** archive does not require an apply review

#### Scenario: Policy locks apply review settings

- **WHEN** a change is created with an apply entry whose profile enables apply review
- **THEN** a later file edit does not alter that change's apply review

#### Scenario: Project has no git at creation

- **WHEN** a change is created in a project without a git repository and the file enables apply review
- **THEN** the locked policy has `reviews.apply.enabled` false and `git.enabled` false
- **AND** the apply review remains unavailable for that change

#### Scenario: Legacy no-git policy stays enabled in the record

- **WHEN** a policy written before this change enables apply review in a project without git
- **THEN** the policy still records `reviews.apply.enabled` true
- **AND** the review is unavailable and archive does not require it

### Requirement: The reviewer model is locked per change

The policy SHALL carry one concrete reviewer model for draft and one for apply. `source: "inherit"` SHALL resolve to the changer's current provider, model and effort when the policy is locked; an unresolvable inherit SHALL fail the policy write. The concrete model MAY omit `reasoningEffort` when that model exposes no selectable effort, and the reviewer then follows the adapter default. The policy SHALL NOT change when the project review file is edited later.

#### Scenario: Inherit resolves at lock time

- **WHEN** a new change locks a review whose profile carries `source: "inherit"`
- **THEN** the policy contains the resolved provider, model and effort

#### Scenario: Inherit cannot resolve

- **WHEN** the changer has no current model at lock time
- **THEN** the change is not created

#### Scenario: The page edits defaults after locking

- **WHEN** the project review file changes the reviewer model after a change is locked
- **THEN** that change's policy keeps the old model

## ADDED Requirements

### Requirement: The policy records its configuration source

The policy SHALL record the configuration source: the path relative to the project root when the file is inside it, otherwise the absolute path, the file's sha256 and the draft and apply profile names. A policy written before this field existed SHALL be read as locked and SHALL NOT be rewritten to add it.

#### Scenario: A new policy carries the source

- **WHEN** a change locks its policy from the project file
- **THEN** the policy carries `source.path` `openspec/reviews.json`, its sha256 and both profile names

#### Scenario: The first start names another file

- **WHEN** the first review start supplies a configuration path
- **THEN** the policy is resolved from that file and its source facts name that path

#### Scenario: An older policy has no source

- **WHEN** a review reads a policy that records no source
- **THEN** the review proceeds with the recorded parameters

#### Scenario: The file hash differs from the recorded hash

- **WHEN** the project file has changed since the policy was locked
- **THEN** the review proceeds and does not fail on the difference

### Requirement: A locked policy is never relocked

A locked policy SHALL keep its parameters for the change's lifetime. The plugin SHALL NOT compare the current file with the locked source, SHALL NOT offer a relock action, and SHALL NOT fail a review because the file changed.

#### Scenario: The file changes after locking

- **WHEN** the project review file changes and the change's review resumes
- **THEN** the review continues with the locked parameters

#### Scenario: A caller tries to relock

- **WHEN** a caller looks for a relock argument on `openspec_review`
- **THEN** the tool exposes none and the existing argument set is unchanged

### Requirement: The disabled switch clears every review gate

When `reviewEnabled` is false, the draft and apply readiness gates SHALL pass for a change whose locked policy enables them, so apply and archive are not blocked by reviews the plugin no longer offers. The locked policy SHALL keep its recorded sections.

#### Scenario: A locked change applies under the disabled switch

- **WHEN** `reviewEnabled` is false and a change's locked policy enables the draft review
- **THEN** `openspec_apply_next` does not refuse on the draft gate

#### Scenario: A locked change archives under the disabled switch

- **WHEN** `reviewEnabled` is false and a change's locked policy enables the apply review
- **THEN** `openspec_archive` does not require that review

#### Scenario: The switch is re-enabled

- **WHEN** `reviewEnabled` is true again
- **THEN** the same change's gates enforce the recorded policy
