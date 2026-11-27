# Spec Delta

## ADDED Requirements

### Requirement: An armed draft watch does not hold the process open

An armed draft round watch SHALL NOT keep the process alive: its file-watcher handle and its debounce timer SHALL be released, so a process whose remaining work is only the watch exits normally before a report, an abandon or an unload. Disarming or closing the watch SHALL release both handles.

#### Scenario: A process with only an armed watch exits

- **WHEN** a process arms a draft round watch and its other work ends
- **THEN** the process exits without waiting for a report, an abandon or an unload

#### Scenario: Disarming closes the watcher

- **WHEN** the watch is disarmed or the review is abandoned
- **THEN** the file watcher is closed and the debounce timer is cleared
