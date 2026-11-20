# tool-surface delta

## MODIFIED Requirements

### Requirement: Land results report cleanup facts

The `openspec_apply_worktree action=land` result SHALL carry `cleanup` with `complete`, `worktreeRemoved`, `branchRemoved` and optional `error`, and its output schema SHALL declare the object. A cleanup retry SHALL report the same shape without a second fast-forward or archive.

#### Scenario: A completed cleanup is reported

- **WHEN** land removes the worktree and branch
- **THEN** the result carries `cleanup.complete: true` and both flags true

#### Scenario: A failed cleanup is reported

- **WHEN** the worktree or branch removal fails
- **THEN** the result carries `cleanup.complete: false` and the error

#### Scenario: A cleanup retry is reported

- **WHEN** land runs for an archived state with incomplete cleanup
- **THEN** the result reports the cleanup outcome and no new land commit or archive commit

## ADDED Requirements

### Requirement: Land results report the landed commit

The `openspec_apply_worktree action=land` result SHALL carry `landCommit` equal to the commit that carries the landed implementation, and its output schema SHALL declare it. It SHALL keep `mergeCommit` as a deprecated alias equal to `landCommit`. A cleanup retry for a legacy manifest SHALL report both values resolved from that manifest.

#### Scenario: A fast-forward land reports the commit

- **WHEN** land fast-forwards main to the reviewed feature head
- **THEN** the result reports `landCommit` and `mergeCommit` with that head

#### Scenario: A legacy cleanup reports the manifest commit

- **WHEN** a cleanup retry reads a manifest with only `mergeCommit`
- **THEN** the result reports the resolved value as both `landCommit` and `mergeCommit`
