# Spec Delta

## ADDED Requirements

### Requirement: Review round arguments accept extra round tokens

`openspec_review` SHALL accept a positive integer or an extra round token `E<n>` for `round`. Draft review SHALL reject an extra token. Apply review SHALL resolve the token for `resume`, `self-report`, `report`, `dispose`, `waive` and `extend` through one shared resolver, and SHALL refuse a token that names no recorded extra round. Status SHALL report every extra round and SHALL NOT require a round argument.

#### Scenario: A normal round number still works

- **WHEN** a caller passes `round: 1` for a recorded normal round
- **THEN** the action targets round 1

#### Scenario: An extra token targets its round

- **WHEN** a caller passes `round: "E1"` for an apply review that recorded `E1`
- **THEN** the action targets `E1`

#### Scenario: Draft review refuses an extra token

- **WHEN** a caller passes `round: "E1"` with `review: "draft"`
- **THEN** the call is refused and names the numeric round form

#### Scenario: An unknown token is refused

- **WHEN** a caller passes `round: "E9"` and no such extra round exists
- **THEN** the call is refused and names the recorded rounds

#### Scenario: Status reports without a round argument

- **WHEN** status runs for a record with `E1`
- **THEN** the result reports `E1` without requiring a round argument

### Requirement: Review results report extra rounds

The `openspec_review` result SHALL keep the numeric `round` as the latest normal round and SHALL add `roundToken` and `extraRounds`. `roundToken` SHALL carry `E<n>` only for an extra round and SHALL be omitted for a normal round. Its closed output schema SHALL declare both, so the Host can validate every extra-round result. Status SHALL list each extra round's token, verdict and readiness.

#### Scenario: An extra round result is declared

- **WHEN** resume opens `E1`
- **THEN** the result carries `roundToken: "E1"` and an `extraRounds` entry
- **AND** the output schema declares both fields

#### Scenario: A normal round omits the token

- **WHEN** the result reports a normal round
- **THEN** it carries the numeric `round` and no `roundToken`

#### Scenario: Status lists extra rounds

- **WHEN** status runs for a record with `E1` reported
- **THEN** the result lists `E1`, its verdict and readiness

### Requirement: The reviewer tool reads extra rounds

`openspec_reviewer` SHALL accept a normal round number or an extra token `E<n>` for `round`. The `brief` read SHALL use the current extra round while one is open, `own-report` SHALL resolve the requested token, `findings` and `status` SHALL describe the current round, and `submit` SHALL bind the report to the current extra round. The reviewer output schema SHALL declare the current round token and a `roundToken` on an extra round `findings` history entry; a normal entry SHALL omit it.

#### Scenario: The reviewer reads the extra brief

- **WHEN** `E1` is the current apply round and the reviewer reads `brief`
- **THEN** the brief is the `E1` brief

#### Scenario: The reviewer submits for the extra round

- **WHEN** the reviewer submits a report while `E1` is current
- **THEN** the report is stored on `E1`

#### Scenario: The reviewer reads an extra own-report

- **WHEN** the reviewer reads `own-report` with `round: "E1"`
- **THEN** the `E1` report is returned

#### Scenario: The findings history carries the extra token

- **WHEN** the reviewer reads `findings` and the history includes `E1`
- **THEN** that entry carries `roundToken: "E1"` and a numeric `round`

### Requirement: Land results report cleanup facts

The `openspec_apply_worktree action=land` result SHALL carry `cleanup` with `complete`, `worktreeRemoved`, `branchRemoved` and optional `error`, and its output schema SHALL declare the object. A cleanup retry SHALL report the same shape without a second merge.

#### Scenario: A completed cleanup is reported

- **WHEN** land removes the worktree and branch
- **THEN** the result carries `cleanup.complete: true` and both flags true

#### Scenario: A failed cleanup is reported

- **WHEN** the worktree or branch removal fails
- **THEN** the result carries `cleanup.complete: false` and the error

#### Scenario: A cleanup retry is reported

- **WHEN** land runs for an archived state with incomplete cleanup
- **THEN** the result reports the cleanup outcome and no new merge commit
