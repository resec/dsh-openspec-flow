# Spec Delta

## ADDED Requirements

### Requirement: Draft review resolves requirement anchors

At draft review `start` and `resume`, the host SHALL check every MODIFIED and REMOVED requirement name, and every RENAMED `from`, against the current main spec. Pending renames SHALL be followed, so a rename target resolves through its source. A name with no baseline SHALL block, and a delta that anchors to a missing main spec SHALL block. The refusal SHALL name both clearing routes: fix the artifacts and resume, and wait for an adding change to archive and resume.

#### Scenario: A MODIFIED name resolves in the main spec

- **WHEN** a MODIFIED requirement name equals a requirement in its main spec
- **THEN** the preflight records no anchor issue for it

#### Scenario: A missing MODIFIED name blocks

- **WHEN** a MODIFIED requirement name has no match in its main spec
- **THEN** the preflight records a blocking anchor issue
- **AND** the draft review is not ready

#### Scenario: A rename target resolves through its source

- **WHEN** a delta renames `Old` to `New` and a MODIFIED requirement is named `New`
- **THEN** the preflight resolves `New` through `Old` and records no anchor issue

#### Scenario: A missing REMOVED name blocks

- **WHEN** a REMOVED requirement name has no match in its main spec
- **THEN** the preflight records a blocking anchor issue

#### Scenario: A missing RENAMED source blocks

- **WHEN** a RENAMED `from` has no match in its main spec
- **THEN** the preflight records a blocking anchor issue

#### Scenario: A missing name names both clearing routes

- **WHEN** a MODIFIED name has no main-spec baseline
- **THEN** the preflight records a blocking anchor issue
- **AND** the refusal names fixing the artifacts and resuming, and waiting for an adding change to archive and resuming

#### Scenario: A missing main spec blocks

- **WHEN** a delta with a MODIFIED, REMOVED or RENAMED requirement has no main spec file
- **THEN** the preflight records a blocking anchor issue for the missing spec

#### Scenario: Editing the artifacts clears the anchor issue

- **WHEN** the author corrects the name and resumes the draft review
- **THEN** the preflight rechecks the current artifacts
- **AND** a cleared result no longer blocks readiness

### Requirement: Draft review resolves task execution paths

At draft review `start` and `resume`, the host SHALL check every repo-relative `test/` or `scripts/` path named in a backticked code span in `tasks.md`. A path that does not exist at the project root SHALL block unless the task clause that names it declares creating, deleting, renaming or moving it. Globs, placeholders, absolute paths, `..` segments and paths outside `test/` and `scripts/` SHALL be skipped.

#### Scenario: An existing test path passes

- **WHEN** tasks.md names `test/review-draft.test.mjs` and the file exists
- **THEN** the preflight records no path issue for it

#### Scenario: A missing undeclared path blocks

- **WHEN** tasks.md names `test/missing.test.mjs`, the file does not exist and no clause declares creating, deleting, renaming or moving it
- **THEN** the preflight records a blocking path issue with the task line
- **AND** the draft review is not ready

#### Scenario: A declared new path passes

- **WHEN** a task says to add `test/new-preflight.test.mjs` and the file does not exist yet
- **THEN** the preflight records no path issue for it

#### Scenario: A declared deletion passes

- **WHEN** a task says to delete `test/legacy.test.mjs` and the file no longer exists
- **THEN** the preflight records no path issue for it

#### Scenario: A glob is skipped

- **WHEN** tasks.md names `test/review-*.test.mjs`
- **THEN** the preflight does not treat it as a missing path

#### Scenario: Editing the task clears the path issue

- **WHEN** the author fixes the path or declares the file and resumes the draft review
- **THEN** the preflight rechecks the current tasks.md
- **AND** a cleared result no longer blocks readiness

### Requirement: The draft execution preflight is recorded and rechecked

The draft review SHALL record the execution preflight result as an additive field, render it in the brief, and stay not ready while it blocks. The first apply entry before apply starts, and apply review `start` or `resume`, SHALL recheck it and refuse on a blocking result. After apply starts, draft readiness SHALL NOT gate on the recorded result; apply review owns the recheck. A block with no finding SHALL be cleared by draft `resume`, not `dispose`.

#### Scenario: A blocking result is recorded and shown

- **WHEN** the preflight finds a missing anchor or an undeclared missing path
- **THEN** the draft record carries the blocking result
- **AND** the draft brief lists the issue
- **AND** the draft review is not ready

#### Scenario: The first apply entry refuses a blocking result

- **WHEN** the first `openspec_apply_next` runs before apply starts and the recheck blocks
- **THEN** the call fails and names the blocking issue and the draft resume action

#### Scenario: Apply review refuses a blocking result

- **WHEN** an apply review starts or resumes after a plan edit and the preflight blocks
- **THEN** the call refuses to open the round and names the blocking issue

#### Scenario: A started apply defers to apply review

- **WHEN** apply started and the recorded execution result still blocks
- **THEN** draft readiness does not report it
- **AND** apply review rechecks it

#### Scenario: A no-finding block resumes without dispose

- **WHEN** the only outstanding reason is a blocking execution result and no finding is open
- **THEN** the next action is `openspec_review action=resume review=draft`
- **AND** it is not `openspec_review action=dispose`

## MODIFIED Requirements

### Requirement: Draft readiness gates apply

Before apply starts, the draft review SHALL be ready only when its latest report is valid, its verdict is `pass`, every critical or major finding is verified or waived, every finding has a disposition, no blocking requirement-length or execution-preflight result is recorded, and the artifact hash matches. `openspec_apply_next` SHALL refuse to start apply while an enabled draft review is not ready; after apply starts, apply review rechecks both results.

#### Scenario: Ready review passes apply

- **WHEN** the draft review has a passing report, no open blocker, no blocking length or execution result and a matching artifact hash
- **THEN** `openspec_apply_next` proceeds

#### Scenario: Blocking length result blocks the first apply entry

- **WHEN** before apply starts, the draft record has a blocking length result and no open finding
- **THEN** `openspec_apply_next` fails and names `openspec_review` with `action: "resume"` and `review: "draft"`

#### Scenario: Blocking execution result blocks the first apply entry

- **WHEN** before apply starts, the draft record has a blocking execution result and no open finding
- **THEN** `openspec_apply_next` fails and names `openspec_review` with `action: "resume"` and `review: "draft"`

#### Scenario: Open blocker blocks apply

- **WHEN** the latest report has an open major finding
- **THEN** `openspec_apply_next` fails and names `openspec_review` as the next step

#### Scenario: Review is disabled

- **WHEN** the change policy disables draft review
- **THEN** `openspec_apply_next` does not require a draft review

#### Scenario: Legacy change has no policy

- **WHEN** a change predates the review policy and no policy file exists
- **THEN** `openspec_apply_next` does not enforce the gate before the first review start

#### Scenario: Apply started ignores the artifact drift

- **WHEN** apply started and the change artifacts no longer equal the draft record hash
- **THEN** the draft review readiness no longer reports the hash mismatch
- **AND** the next action points at the apply review

#### Scenario: A started apply defers the length check

- **WHEN** apply started and the current artifacts carry a blocking length result
- **THEN** `openspec_apply_next` does not refuse the resync for that result
- **AND** apply review start or resume rechecks it

#### Scenario: A started apply defers the execution check

- **WHEN** apply started and the current artifacts carry a blocking execution result
- **THEN** `openspec_apply_next` does not refuse the resync for that result
- **AND** apply review start or resume rechecks it

#### Scenario: Apply resync after a plan change proceeds

- **WHEN** `openspec_apply_next` runs again after apply started and the plan changed
- **THEN** the draft hash mismatch does not refuse the call
