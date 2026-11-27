# Spec Delta

## MODIFIED Requirements

### Requirement: State names are safe path segments

The state file name and the change lock directory name SHALL use the review store's safe-segment rule for `store` and `change`: a value equal to `.` or `..`, or containing `/`, `\`, NUL, the key separator `#` or a control character, SHALL be refused before a path is built. `#` is refused because the review key joins `<store>#<change>` and the state name appends `.json` to that key.

#### Scenario: A slash in a change name is refused

- **WHEN** `change` contains `/`
- **THEN** the plugin refuses the call before writing state or creating a lock

#### Scenario: A traversal segment is refused

- **WHEN** `store` or `change` is `.` or `..`
- **THEN** the plugin refuses the call before building a path

#### Scenario: A double dot inside a name is accepted

- **WHEN** `change` is `foo..bar`
- **THEN** the plugin accepts it; only the whole value `.` or `..` is refused

#### Scenario: A backslash or NUL is refused

- **WHEN** `store` or `change` contains `\` or NUL
- **THEN** the plugin refuses the call before building a path

#### Scenario: The key separator is refused

- **WHEN** `store` or `change` contains `#`
- **THEN** the plugin refuses the call, so `a#b` with `c` and `a` with `b#c` cannot build one key

#### Scenario: A control character is refused

- **WHEN** `store` or `change` contains a control character such as a newline
- **THEN** the plugin refuses the call before building a path

## ADDED Requirements

### Requirement: A state file names its own change

A reader SHALL compare the state file's `change` with the change it was asked for and SHALL reject the state when the two differ, naming both. The comparison SHALL be exact, so a name that differs only in case is a different change.

#### Scenario: A state for another change is rejected

- **WHEN** the state file at the requested change's path carries a different `change`
- **THEN** the plugin rejects the state instead of returning it

#### Scenario: A state for the requested change is returned

- **WHEN** the state file carries the requested `change`
- **THEN** the plugin returns the state
