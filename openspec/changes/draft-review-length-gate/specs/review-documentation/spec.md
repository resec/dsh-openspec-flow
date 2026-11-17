# review-documentation spec delta

## ADDED Requirements

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
