# Spec Delta

## ADDED Requirements

### Requirement: Findings do not name another change

A report SHALL be refused when a new finding's `location` resolves under another change's directory under `openspec/changes/`, including `openspec/changes/archive/`. The refusal SHALL name the finding and instruct the reviewer to record the concern in `outOfScope` instead. The check SHALL apply to draft and apply reports from self-review and independent reviewers.

#### Scenario: Another change's location is refused

- **WHEN** a report carries a finding at `openspec/changes/another-change/tasks.md:12`
- **THEN** the submission fails and names the finding and `outOfScope`
- **AND** no report is stored

#### Scenario: An archived change's location is refused

- **WHEN** a finding's location starts with `openspec/changes/archive/`
- **THEN** the submission fails and names `outOfScope`

#### Scenario: A parent-relative path is checked

- **WHEN** a draft finding's location is `../another-change/tasks.md:12`
- **THEN** the submission fails because the location resolves under another change

#### Scenario: A nested-root location is refused

- **WHEN** a finding's location is `apps/web/openspec/changes/another-change/tasks.md:12`
- **THEN** the submission fails because the location resolves under another change

#### Scenario: An interior parent path is refused

- **WHEN** a finding's location is `openspec/changes/<reviewed-change>/../another-change/tasks.md:12`
- **THEN** the submission fails because the location resolves under another change

#### Scenario: Both reviewer modes use the check

- **WHEN** a self-review and an independent reviewer each submit a report with another change's location
- **THEN** both submissions fail before a report is stored

### Requirement: Only another change's location is refused

A finding's `location` that names the reviewed change SHALL be accepted. A location with no `openspec/changes/` segment that names a main spec, code, documentation, a change-relative artifact path or a section heading SHALL be accepted. A location carrying an `openspec/changes/` segment at any depth SHALL be treated as a change location, even when the path is a fixture or documentation path. An `outOfScope` entry that names another change SHALL be accepted.

#### Scenario: The reviewed change's location is accepted

- **WHEN** a finding's location is `openspec/changes/<reviewed-change>/proposal.md:12`
- **THEN** the report is accepted

#### Scenario: A location without the segment is accepted

- **WHEN** a finding's location is a main spec path, a code path, a change-relative artifact path or a section heading, and it has no `openspec/changes/` segment
- **THEN** the report is accepted

#### Scenario: A fixture path carrying the segment is refused

- **WHEN** a finding's location is `test/fixtures/probe/openspec/changes/add-dark-mode/tasks.md:12`
- **THEN** the submission fails because the path carries a change location

#### Scenario: A concern in outOfScope is accepted

- **WHEN** another change's path is listed in `outOfScope` and the findings list is empty
- **THEN** the report is accepted

### Requirement: Review briefs state the cross-change boundary

The draft and apply briefs SHALL state that another change's directory under `openspec/changes/` is outside the review's scope even when it appears in the reviewed tree or workspace, that a finding requiring it to change is refused, and that such a concern belongs in `outOfScope`. The apply brief SHALL still state that the whole committed tree is the review object.

#### Scenario: The draft brief states the boundary

- **WHEN** a draft review returns its brief
- **THEN** the brief states that another change's directory is outside the review's scope and that the concern belongs in `outOfScope`

#### Scenario: The apply brief states the boundary

- **WHEN** an apply review returns its brief
- **THEN** the brief states that another change's directory is outside the review's scope and that the concern belongs in `outOfScope`
- **AND** it still states that the whole committed tree is the review object
