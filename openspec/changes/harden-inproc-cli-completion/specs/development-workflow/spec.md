# Spec Delta: development-workflow

## ADDED Requirements

### Requirement: In-process CLI calls await asynchronous command completion

The in-process CLI runner SHALL wait for the asynchronous command action to settle when the CLI module exposes an awaitable program entry, and SHALL end such a call early only through the configured deadline or the call's abort. A module without that entry SHALL keep the output-based polling path as a fallback. Exit-code reporting SHALL be preserved on both paths.

#### Scenario: A delayed asynchronous command completes

- **GIVEN** a CLI module whose awaitable entry logs, awaits a delay, then logs again
- **WHEN** the in-process runner executes the call
- **THEN** the call completes only after the second log
- **AND** the captured stdout contains both records

#### Scenario: The fallback remains available

- **GIVEN** a CLI module that exposes no awaitable program entry
- **WHEN** the in-process runner executes a call
- **THEN** the runner uses the output-based completion path
- **AND** the call reports the same exit code and captured output as before

#### Scenario: The pinned CLI takes the awaitable path

- **GIVEN** the pinned bundled CLI is loaded
- **WHEN** the runner selects its completion path
- **THEN** it finds an awaitable program entry
- **AND** it does not complete through the polling fallback

#### Scenario: A bounded deadline terminates a stalled call

- **GIVEN** an awaitable entry that never settles
- **WHEN** the configured deadline elapses
- **THEN** the call completes with exit code 124
- **AND** the per-call process state is restored

#### Scenario: An aborted call releases the queue

- **GIVEN** an awaitable entry that never settles
- **WHEN** the call's abort signal fires
- **THEN** the call rejects with the abort error
- **AND** the next queued call completes with its own output
- **AND** the per-call process state is restored

#### Scenario: Repeated calls share the awaitable entry

- **GIVEN** the runner has loaded the CLI module once
- **WHEN** two calls run in sequence through the same program instance
- **THEN** both calls complete with their own output
- **AND** neither call observes the other call's output
