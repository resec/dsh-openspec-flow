# Spec Delta: development-workflow

## ADDED Requirements

### Requirement: Apply review commits address one finding

Every commit made during apply review SHALL address at most one finding: it carries that finding's fix, or the rework a later review demands, with the regression test when behavior changes, and no other finding's changes. A finding MAY take more than one commit. A finding that changes no committed file SHALL leave no commit. The findings of a round SHALL be committed before the next round opens.

#### Scenario: A round reports several findings

- **WHEN** an apply review round reports several findings that change committed files
- **THEN** each commit addresses one finding
- **AND** no commit carries another finding's changes

#### Scenario: A later review overturns a fix

- **WHEN** a later review overturns the fix committed for one finding
- **THEN** the rework lands as a further commit for that same finding
- **AND** neither commit carries another finding's changes

#### Scenario: A finding's fix changes only documentation

- **WHEN** a fixed finding changes only documentation or a planning artifact
- **THEN** the fix lands as that finding's own commit
- **AND** it follows the same one-finding-per-commit rule

#### Scenario: A finding changes no committed file

- **WHEN** a finding is disposed as deferred, rejected or waived
- **THEN** no commit is made for it
- **AND** the disposition stays in the review record rather than in git

#### Scenario: A round's findings are ready for the next round

- **WHEN** every handled finding of a round is committed
- **THEN** the next round opens on those commits
- **AND** the log read before resuming shows each commit answering one finding

### Requirement: Git carries no review-local identifiers

The repository SHALL keep review round numbers, extra-round tokens, finding ids, review record paths and card files out of committed content. Where that content must carry a finding's substance, it SHALL restate the defect and the fix. Text that defines or implements these formats MAY name them. A commit written before this convention SHALL NOT gain these identifiers, and a history rewrite another requirement in this capability requires SHALL stay allowed.

#### Scenario: A commit answers a finding

- **WHEN** a maintainer commits a fix for an apply review finding
- **THEN** the message states the defect, the fix and the reason
- **AND** it names no round number, extra-round token, finding id, record path or card file

#### Scenario: A change README reports a review conclusion

- **WHEN** a change README describes the work done for a review finding
- **THEN** it restates the defect and the fix
- **AND** it names no round number, extra-round token, finding id, record path or card file

#### Scenario: The history needs a finding's content

- **WHEN** a commit message must carry what the finding said
- **THEN** it restates the defect and the fix in its own words
- **AND** a reader without the review record can follow it

#### Scenario: Contract text names the formats

- **WHEN** a specification, `docs/review.md`, the plugin source, its tests, the README, `AGENTS.md` or a change about review rounds defines or implements these formats
- **THEN** naming `R<round>-NN`, `E<n>` or a record path there is allowed
- **AND** that text is not a citation of the review that produced a change

#### Scenario: A change implements review rounds

- **WHEN** a feature commit adds or changes review rounds
- **THEN** its message may name rounds as the feature's subject
- **AND** it cites no finding from a review of that work

#### Scenario: History predates the convention

- **WHEN** a commit was written before this convention
- **THEN** it is not retrofitted with these identifiers
- **AND** it is otherwise left as it is

#### Scenario: Another requirement requires a history rewrite

- **WHEN** a host path must be removed from reachable history
- **THEN** the rewrite follows `Repository content and history exclude host paths`
- **AND** this requirement does not block it
