# Spec Delta

## MODIFIED Requirements

### Requirement: Land takes over the apply lock

Land SHALL verify the state `lockPid` is its own process and `lockToken` matches the live change lock, release that lock as the owner, set `status: landing`, acquire the lifecycle lock, then a fresh change lock, and record the fresh lock's token/pid in the state. A pid/token mismatch SHALL refuse; a dead owner SHALL use `recover`. A failure before the merge SHALL restore `status: active` and put the released change lock back under its token, without waiting.

#### Scenario: The owner releases and land takes over

- **WHEN** land starts in the apply owner process and the token matches
- **THEN** it releases its own change lock, sets `landing`, acquires lifecycle and then a fresh change lock

#### Scenario: A mismatched owner is refused

- **WHEN** the pid or token does not match the live lock
- **THEN** land refuses without deleting the lock

#### Scenario: A dead owner uses recover

- **WHEN** the recorded owner pid is dead
- **THEN** land reports `openspec_apply_worktree action=recover`, then acquires the free lock and replaces the state token/pid

#### Scenario: A failed handover restores active

- **WHEN** the lifecycle lock cannot be acquired
- **THEN** land fails before the merge, the state stays `active` with its token, and the released change lock is back under that token
- **AND** an owner that took the change lock meanwhile is reported instead
