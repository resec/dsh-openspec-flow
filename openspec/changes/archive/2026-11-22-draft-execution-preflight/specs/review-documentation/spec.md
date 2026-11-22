# Spec Delta

## ADDED Requirements

### Requirement: The review document states the execution preflight

`docs/review.md` SHALL state that draft review checks requirement anchors and task test/script paths, that a requirement name with no main-spec baseline, a delta whose main spec file is missing, or an undeclared missing path blocks apply, that a baseline only another unarchived change supplies is cleared by waiting for that change to archive and resuming the draft review, that the result is recorded and shown in the brief, and that the first apply entry and apply review recheck it.

#### Scenario: The document describes the preflight

- **WHEN** the document describes the draft execution preflight
- **THEN** it names the anchor check, the task path check, the recorded result and the blocking effect
- **AND** it names draft `resume` as the clearing action for a no-finding block
- **AND** it names the wait-for-the-adding-change route for a baseline another unarchived change supplies
- **AND** it states that the first apply entry and apply review recheck the result

### Requirement: The README states the draft execution preflight

`README.md` SHALL state that draft review blocks an unresolvable requirement anchor and an undeclared missing test or script path, that a no-finding block is cleared by draft `resume`, and SHALL name `docs/review.md` for the handling.

#### Scenario: The README review section describes the preflight

- **WHEN** the README review section describes draft review
- **THEN** it names the execution preflight, the resume next action and links `docs/review.md`
