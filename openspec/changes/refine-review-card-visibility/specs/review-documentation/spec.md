# Spec Delta: review-documentation

## ADDED Requirements

### Requirement: The document states the review-card writers and visibility

The document SHALL state that only the reporting session writes a review card: `self-report` in a self review and reviewer `submit` in an independent review. It SHALL state that `wait` and `report` write no review card and that an independent review does not deliver or bind a review card for the changer session, including a card written before this rule.

#### Scenario: The writer set is documented

- **WHEN** a reader reaches the review-card section
- **THEN** the document names `self-report` and reviewer `submit` as the review-card writers
- **AND** it states that `wait` and `report` write no review card

#### Scenario: The changer visibility rule is documented

- **WHEN** the document describes card delivery
- **THEN** it states that an independent review does not deliver a review card to the changer session
- **AND** it states that existing changer review cards are withheld as well

### Requirement: The document states the change name in the card summary

The document SHALL state that the collapsed summary shows the change name between the phase title and the review kind and omits the segment when the name is absent or empty.

#### Scenario: The summary order is documented

- **WHEN** a reader reaches the card shape description
- **THEN** the document names the change name between the phase title and the review kind
- **AND** it states that a missing name omits the segment
