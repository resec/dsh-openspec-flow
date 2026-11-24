# Spec Delta

## MODIFIED Requirements

### Requirement: Concurrent worktree preparation

Chromium preparation SHALL serialize through one lock under the shared root, used by `init --browser` and bootstrap. The lock SHALL appear with its owner or not at all. A waiter SHALL wait and recheck, then reuse a browser the holder installed; it SHALL name the owner on timeout. A dead owner's lock SHALL be reclaimable, and an ownerless lock SHALL be reclaimed after a short grace period. Concurrent worktrees SHALL keep `node_modules`, `DSH_HOME` and output separate; lab ports stay OS-assigned.

#### Scenario: Two worktrees prepare Chromium concurrently

- **WHEN** two worktrees run `init --browser` at the same time
- **THEN** one installs under the shared lock and the other waits, rechecks and finishes with the same usable browser path

#### Scenario: Bootstrap and init share the lock

- **WHEN** bootstrap and `init --browser` prepare the same shared root at the same time
- **THEN** both use the same lock and only one Chromium installation runs

#### Scenario: A reset waits for the lock

- **WHEN** bootstrap runs `--reset-browsers` while another preparation holds the shared lock
- **THEN** the reset waits for the lock before checking and removing the shared browser directory

#### Scenario: The lock appears with its owner

- **WHEN** a preparation acquires the shared lock
- **THEN** the lock directory becomes visible only together with its owner record

#### Scenario: A dead owner is reclaimed

- **WHEN** the lock records a process that no longer exists
- **THEN** the next preparation reclaims the lock and installs the browser

#### Scenario: An ownerless lock is reclaimed after the grace period

- **WHEN** a lock directory without an owner record is older than the grace period
- **THEN** the next preparation moves it aside and acquires the lock

#### Scenario: A young ownerless lock is left alone

- **WHEN** a lock directory without an owner record appeared moments ago
- **THEN** the waiter keeps waiting instead of deleting it

#### Scenario: A timeout names the owner

- **WHEN** a live owner holds the lock past the wait timeout
- **THEN** the waiter fails and names the owner instead of deleting the lock

#### Scenario: A timeout on an ownerless lock says so

- **WHEN** the wait times out on a lock that has no owner record
- **THEN** the error states that the lock has no owner and when an ownerless lock is reclaimed

#### Scenario: check reports a held lock

- **WHEN** `check` runs while another process holds the shared install lock
- **THEN** it reports the lock and its owner without removing it

#### Scenario: Concurrent tests keep their own state

- **WHEN** two worktrees run their test commands at the same time
- **THEN** each uses its own `node_modules`, `DSH_HOME` and output directory

#### Scenario: Lab ports stay OS-assigned

- **WHEN** two lab runs start concurrently
- **THEN** their web and mock servers bind OS-assigned ports and do not require a worktree port derivation
