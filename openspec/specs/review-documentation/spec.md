# review-documentation Specification

## Purpose
Defines the single user-facing review document and the checks that keep it aligned with the plugin's tools, configuration and record layout.

## Requirements

### Requirement: The review document covers the whole review system

`docs/review.md` SHALL describe in one place: the purpose of review, the draft and apply objects, the phase boundaries, concurrent draft reviews, the serial apply lock, reviewer modes and models, policy locking and configuration, the report and finding contract, severity, verdict, readiness, records, failure handling, the no-git exception with the `policy`/`enabled`/`available` status fields, and the `mode`/`independent` fields with their derivation and recorded-value rule.

#### Scenario: A reader starts from the document

- **WHEN** a reader opens `docs/review.md`
- **THEN** the document explains both review types and both reviewer modes without requiring another file

#### Scenario: The document explains the object split

- **WHEN** the reader reaches the object section
- **THEN** it states that draft review uses the change artifacts and apply review uses the committed git tree

#### Scenario: The document explains the gates

- **WHEN** the reader reaches the gates
- **THEN** it states that `openspec_apply_next` waits for draft review
- **AND** it states that a git project seals the draft with a commit that contains the change directory, its OpenSpec ignore file and may contain other `openspec/changes/` paths
- **AND** it states that `openspec_archive` waits for apply review when the review is enabled and the project has git, and proceeds without it otherwise

#### Scenario: The document explains the phase boundary

- **WHEN** the reader reaches the phase boundary
- **THEN** it states that the draft review can be resumed before apply started and cannot be resumed after
- **AND** it states that a plan change during apply needs the user's written waiver

#### Scenario: The document explains the concurrency contract

- **WHEN** the reader reaches the concurrency section
- **THEN** it states that several changes may hold draft reviews at the same time
- **AND** it states that one change applies and archives at a time
- **AND** it states that another change's apply entry is refused while the lock is held, while its draft review remains available
- **AND** it states that another change's uncommitted planning files do not block the holding change's seal, apply review or archive
- **AND** it states that each lock lives in its domain's worktree git directory or under `openspec/.review/`; a store change also uses its store domain, and a session outside every root uses the change root
- **AND** it states that a store change applied from another project is refused until the first project archives

#### Scenario: The document explains the manual release

- **WHEN** the reader looks for how to unblock a paused change
- **THEN** it states that removing every lock file named in the refusal releases the locks
- **AND** it states where the lock files live
- **AND** it states that only the user may remove them and the agent must ask the user
- **AND** it states that the next apply entry acquires fresh locks

#### Scenario: The document explains the no-git exception

- **WHEN** the reader reaches the apply object section
- **THEN** it states that a new policy created by this plugin in a project without git locks apply review disabled
- **AND** it states that a legacy policy may still record apply review enabled but status reports it unavailable
- **AND** it states that a change with no policy reports `policy: false` and archive does not wait

#### Scenario: The document explains the status fields

- **WHEN** the reader reaches the status description
- **THEN** it explains `policy`, `enabled` and `available`, including that unavailable takes precedence over an unset policy
- **AND** it explains `mode` and `independent`: the locked `reviewers` value determines them for an enabled and available review, a disabled or unavailable review reports `self`/`false`, and a recorded review reports its recorded values

#### Scenario: The document explains the frozen reviewer

- **WHEN** the reader reaches the reviewer section
- **THEN** it states that the reviewer runs the installed plugin artifact
- **AND** it states that editing plugin sources does not change the installed copy or reload the reviewer
- **AND** it states that new plugin logic takes effect only after a reinstall

### Requirement: The document names the live tools and actions

The document SHALL name `openspec_review`, `openspec_reviewer`, their actions, `openspec_apply_next` and `openspec_archive` exactly as registered. It SHALL NOT name a removed tool or an OpenSpec CLI command.

#### Scenario: Tools are checked

- **WHEN** the documentation test reads the tool registrations
- **THEN** every tool named in the document exists and every action is in the live schema

#### Scenario: A removed tool is documented

- **WHEN** the document names a tool or action that is not registered
- **THEN** the documentation test fails

### Requirement: The document matches configuration defaults

The document SHALL list the review config keys and their defaults: draft enabled true, reviewers 0, waitMinutes 15; apply enabled true, reviewers 0, waitMinutes 15; reviewer model inherit. It SHALL state that draft and apply reviews have no round cap and that no round-cap key exists.

#### Scenario: A default changes

- **WHEN** a contributor changes a review default in the code
- **THEN** the documentation test fails until `docs/review.md` is updated

#### Scenario: A key is renamed

- **WHEN** a config key is renamed in the code
- **THEN** the documentation test names the stale key

#### Scenario: A round cap is documented

- **WHEN** the document lists a `maxRounds` key or a round-cap default
- **THEN** the documentation test fails

### Requirement: The document matches the record layout

The document SHALL state the review root `openspec/.review/<store>#<change>/`, the draft/apply record files, the `cards/<sessionKey>-<phase>-<round>.json` layout with a short SHA-256 key, the `<reviewDir>/card-delivery.json` watermark, the `cards` marker, the apply lock locations and fields (`schemaVersion`, `change`, `store`, `changeRoot`, `implementationRoot`, `startedAt`), and the `openspec/.gitignore` entry.

#### Scenario: The record path changes

- **WHEN** the implementation changes the record root or file names
- **THEN** the documentation test fails

#### Scenario: The lock layout is documented

- **WHEN** the documentation test reads `docs/review.md`
- **THEN** it finds the apply lock path and every field name the lock module exports

#### Scenario: The card layout is documented

- **WHEN** the card file directory or name pattern changes
- **THEN** the documentation test fails until `docs/review.md` describes the new layout

### Requirement: README links the document

The README SHALL link `docs/review.md` from its review section.

#### Scenario: The link is missing

- **WHEN** the README loses the link
- **THEN** the documentation test fails

### Requirement: The document states the reviewer boundary and validation owner

`docs/review.md` SHALL state that the independent reviewer's model-facing catalog contains `read`, `grep`, `glob`, `read_image`, `web_search`, `web_fetch` and `openspec_reviewer`, with `read_image` conditional on the Host `attachments` service; that inherited Host tools are masked; and that apply review start and resume run strict validation, with the result carried in the brief. It SHALL NOT claim that the reviewer validates the change itself.

#### Scenario: Document names the reviewer catalog

- **WHEN** `docs/review.md` is read
- **THEN** it lists only the seven reviewer tools, conditions `read_image` on the `attachments` service, and says inherited Host tools are masked

#### Scenario: Document names the image-read prerequisites

- **WHEN** `docs/review.md` describes `read_image`
- **THEN** it states the Host `attachments` service and an image-capable route are required

#### Scenario: Document names the validation owner

- **WHEN** the review document describes apply review
- **THEN** it says the plugin runs strict validation at start or resume and the brief carries the result

### Requirement: The document describes batch disposition

`docs/review.md` SHALL state that finding `dispose` and `waive` accept `dispositions` for several findings in one call, that the batch is atomic, that the single `id` form remains, that a plan-change `waive` takes `files` and not `dispositions`, and that `deferred` needs a note because the old `issue` field is no longer accepted and old records keep it.

#### Scenario: Document names the batch parameter

- **WHEN** the review document is read
- **THEN** it shows a `dispositions` example and states that one call can dispose several findings
- **AND** it keeps a single-`id` example

#### Scenario: Document states the atomic rule

- **WHEN** the review document describes a batch
- **THEN** it states that an invalid entry leaves every finding unchanged

#### Scenario: Document states the deferred rule

- **WHEN** the review document describes `deferred`
- **THEN** it requires a note
- **AND** it states that the old `issue` field is no longer accepted and old records keep it

#### Scenario: Document separates the plan-change waiver

- **WHEN** the review document describes `waive`
- **THEN** it states that a plan-change waiver takes `files` and not `dispositions`

### Requirement: The document states the reviewer read targets and the resume gate

`docs/review.md` SHALL state that `openspec_reviewer` `read` supports `brief`, `own-report` with an optional `round`, `findings` and `status`; that `dispositions` belongs to `action: "dispose"` or a finding `action: "waive"`; that `resume` opens no new round while a recorded finding is open; and that `start` and `resume` reject `dispositions`.

#### Scenario: The document lists the read targets

- **WHEN** `docs/review.md` describes the reviewer tool
- **THEN** it names `brief`, `own-report` with an optional `round`, `findings` and `status`

#### Scenario: The document states the dispose-then-resume order

- **WHEN** `docs/review.md` describes a new review round
- **THEN** it says every recorded finding must be disposed before `resume` opens the next round
- **AND** it says `start` and `resume` reject `dispositions`

#### Scenario: The document separates the disposition actions

- **WHEN** `docs/review.md` describes `dispositions`
- **THEN** it says the batch belongs to `action: "dispose"` or a finding `action: "waive"`
- **AND** it does not describe `resume` as carrying dispositions

### Requirement: The document explains the card surface

The document SHALL explain the card files and the `<reviewDir>/card-delivery.json` watermark, the `reviewCards/get` endpoint and turn binding, the `conversation.chat.turnTail` query and rendering, the collapsed and expanded card, the complete expanded report, the plan-change waiver section, the no-truncation and no-pagination rule, the fixed Chinese labels, the write points and the fact that no card data enters the session log or the model-visible surface.

#### Scenario: A reader opens the review document

- **WHEN** a reader reaches the review-card section
- **THEN** it names the card files, the endpoint and the turn-tail rendering
- **AND** it states that the expanded card contains the full report body and the plan-change waiver
- **AND** it states that the expanded card does not truncate or paginate
- **AND** it states that no card data enters the session log or the model-visible surface

#### Scenario: A write point changes

- **WHEN** a card write point is added or removed in code
- **THEN** the documentation test fails until the document lists the new set

### Requirement: The document states the model reporting rule

The document SHALL state that the plugin instructs the model, through the shipped skills, the reviewer brief and the policy text, to write only a short note for information the report cannot express and the user must know, not to restate the report, and that the reviewer brief instructs the reviewer to write no summary after submitting.

#### Scenario: The model rule is documented

- **WHEN** a reader reaches the model behavior section
- **THEN** it states the short-note rule
- **AND** it states that the reviewer brief forbids a summary

### Requirement: The document states the verification boundary

The document SHALL state that DSH verification runs in a self-provided, isolated, clean DSH prepared by the agent, never the development host profile, configuration or sessions. The agent SHALL run the card-file, endpoint and rendering checks that can be automated there; only a check that cannot be automated in that DSH, such as a visual Web GUI review, may remain the user's self-verification boundary.

#### Scenario: A reader checks verification

- **WHEN** a reader reaches the verification boundary
- **THEN** it states that the development host is not used
- **AND** it states that the agent prepares and runs the isolated-DSH checks
- **AND** it names any visual GUI check that remains the user's self-verification

### Requirement: The review document states the apply brief base and diff scope

`docs/review.md` SHALL state that the apply brief names the base reference and identifies its source as the seal commit, an explicit base, or the merge base; that the diff starts at the base tree while the whole committed current tree is the review object; that an empty diff does not mean the change needs no implementation; and that `openspec_review` accepts an optional `base` for the explicit source.

#### Scenario: The reader reaches the apply brief description

- **WHEN** a reader reads the apply brief description in `docs/review.md`
- **THEN** the document names the three base sources and the diff scope
- **AND** it states that an empty diff does not mean the change needs no implementation
- **AND** it names the optional `base` parameter as the explicit source

### Requirement: The README `openspec_review` row names the optional base

The README `openspec_review` row SHALL name the optional `base` parameter for apply review.

#### Scenario: The reader scans the tool table

- **WHEN** a reader reads the `openspec_review` row in `README.md`
- **THEN** the row names the optional `base` for apply review

### Requirement: The document qualifies dispositions with the review kind

`docs/review.md` SHALL state that `dispose` and a finding `waive` name their review kind explicitly, that a draft record refuses both once apply started, and that every dispose example and every stated dispose next action carries the kind.

#### Scenario: Document states the review kind

- **WHEN** the review document describes `dispose` and a finding `waive`
- **THEN** it states that `review` is required
- **AND** it names `draft` and `apply`

#### Scenario: Document states the draft freeze

- **WHEN** the review document describes a draft disposition after apply started
- **THEN** it states that the draft record refuses `dispose` and a finding `waive`

#### Scenario: Examples and next actions carry the kind

- **WHEN** the review document shows a dispose example or names a dispose next action
- **THEN** the example passes `review` and the stated next action carries `review=<kind>`

### Requirement: The README states the disposition kind and the freeze

The README review section SHALL state that `dispose` and a finding `waive` require the review kind, that a draft record refuses both once apply started, and SHALL name the kind-qualified dispose next action instead of the unqualified one. The documentation test SHALL assert both sentences and the qualified next action in the README.

#### Scenario: README states both rules

- **WHEN** the README review section is read
- **THEN** it states that the review kind is required for a disposition
- **AND** it states that a draft record refuses a disposition once apply started

#### Scenario: README names the qualified next action

- **WHEN** the README states the next action after an open finding
- **THEN** the action carries `review=<kind>`

#### Scenario: The test fails on a missing README sentence

- **WHEN** the README drops either sentence or the qualified next action
- **THEN** the documentation test fails and names the README

### Requirement: The review document states the requirement length gate

`docs/review.md` SHALL state that the draft review checks the 500-character requirement-description limit, that an ADDED description over the limit and a MODIFIED description that grows over the limit block apply, that a length-only block names draft `resume` rather than `dispose`, and that an unchanged or shortened legacy description does not.

#### Scenario: The document describes the draft gate

- **WHEN** the document describes the draft requirement length check
- **THEN** it names the 500-character limit, the two blocking cases, the resume next action and the legacy exception
- **AND** it does not claim that the author should compress the text

### Requirement: The review document states the official handling

`docs/review.md` SHALL state the official handling for an overlong requirement: do not compress existing text, keep one behavior per requirement, move examples and edge cases into scenarios, and split an existing long requirement only in a user-requested dedicated change that preserves its header and scenarios and adds removed behaviors as ADDED requirements.

#### Scenario: The document describes an overlong requirement

- **WHEN** the document describes an overlong requirement
- **THEN** it gives the no-compression rule and the dedicated-change split procedure

### Requirement: The README states the draft length gate

`README.md` SHALL state that draft review blocks an overlong ADDED description and a MODIFIED description that grows over the limit, that a length-only block is cleared by draft `resume`, and SHALL name `docs/review.md` for the handling.

#### Scenario: The README review section describes the gate

- **WHEN** the README review section describes draft review
- **THEN** it names the length gate, the resume next action and links `docs/review.md`

### Requirement: The document states the refined card display

`docs/review.md` SHALL state that the collapsed summary counts findings by severity and shows no next action, that unrecorded optional finding and disposition rows are omitted, and that same-state readiness reasons are merged into one line.

#### Scenario: A reader reaches the refined card description

- **WHEN** a reader reads the card section of `docs/review.md`
- **THEN** the document states the per-severity summary without a next action
- **AND** it states that unrecorded optional rows are omitted
- **AND** it states that same-state readiness reasons are merged

### Requirement: The review document states the shared brief report contract

`docs/review.md` SHALL state that the draft and apply briefs render one report contract for the current round from the same source, and that the contract names the finding id rule, the verification statuses and when verifications are empty.

#### Scenario: Document describes the shared contract

- **WHEN** a reader opens the review document
- **THEN** it states that both briefs render one round-aware report contract from the same source
- **AND** it names the finding id rule and the empty-verifications first-round case
