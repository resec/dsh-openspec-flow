# Spec Delta: project-invariants

## ADDED Requirements

### Requirement: Runtime imports stay built-in

The plugin SHALL import only Node built-ins and relative modules at runtime, and SHALL NOT declare an `@deepseek-ai/*` runtime dependency. The review card SHALL be stored as a file under the change's review directory; it SHALL NOT be appended as a Session event.

#### Scenario: A DSH import appears

- **WHEN** plugin source imports an `@deepseek-ai/*` package
- **THEN** the import check fails

#### Scenario: The manifest declares a DSH dependency

- **WHEN** `package.json` declares an `@deepseek-ai/*` runtime dependency
- **THEN** the package check fails

#### Scenario: The card data is a file

- **WHEN** a card is written
- **THEN** it lands under the review directory and no Session event is appended
