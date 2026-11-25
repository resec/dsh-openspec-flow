# Spec Delta

## Purpose

Owns the per-worktree record of the tools bootstrap resolved, the shared version-keyed buckets that hold bootstrap-managed tools, the deps-only preparation that writes the record, the consumer rules that select the recorded tools, and the collection of unreferenced buckets.

## ADDED Requirements

### Requirement: Toolchain record is per worktree
Each worktree SHALL carry its own toolchain record at `<worktree>/.cache/toolchain/manifest.json`. The record SHALL name the resolved Node, npm, pnpm and Chromium paths and versions, the shared bucket paths, the repository inputs it was written for, and a schema version. A worktree SHALL NOT use another worktree's record to select tools, and the record SHALL NOT be copied or shared for that purpose.

#### Scenario: A worktree writes its own record
- **WHEN** deps-only preparation succeeds in a worktree
- **THEN** the record exists under that worktree's `.cache/toolchain/` and names the resolved tools

#### Scenario: A worktree without a record does not borrow one
- **WHEN** the main worktree has a record and a linked worktree has none
- **THEN** the linked worktree reports no record and does not read the main worktree's record

#### Scenario: A failed preparation writes nothing
- **WHEN** preparation fails before it completes
- **THEN** no record is written and an existing record is left unchanged

### Requirement: A record names the inputs it was written for
The record SHALL bind to the exact `package.json`, `package-lock.json`, `coverage.baseline.json` and `coverage.config.json` contents, the pinned pnpm version and the platform. A record whose binding no longer matches SHALL be reported as stale with the correction for the changed input, and SHALL NOT be used as if current.

#### Scenario: A changed lock makes the record stale
- **WHEN** `package-lock.json` changes after a record is written
- **THEN** the record is stale and the correction names `npm ci` and a new preparation

#### Scenario: A changed pin makes the record stale
- **WHEN** the pinned pnpm version changes after a record is written
- **THEN** the record is stale and the correction names a new preparation

#### Scenario: A changed platform makes the record stale
- **WHEN** the record's platform differs from the current platform
- **THEN** the record is stale and is not reused

#### Scenario: Matching inputs are reusable
- **WHEN** every binding still matches
- **THEN** the record is current and consumers use it

### Requirement: Bootstrap prepares tools into version-keyed shared buckets
Bootstrap-managed tools that are not host-provided SHALL be prepared into shared buckets keyed by exact version under the worktree shared root: Node by version when downloaded, pnpm by the pinned version, Chromium by Playwright version. A bucket SHALL carry a completion marker and be written under a per-bucket lock; a partial or unmarked bucket SHALL NOT be reused.

#### Scenario: The pnpm bucket is prepared
- **WHEN** no complete bucket exists for the pinned pnpm version
- **THEN** bootstrap installs that version into the bucket, writes the marker and records the bucket

#### Scenario: A complete bucket is reused
- **WHEN** the bucket and its marker already exist
- **THEN** bootstrap reuses them without reinstalling

#### Scenario: A partial bucket is replaced
- **WHEN** the marker is absent or the bucket is incomplete
- **THEN** bootstrap replaces the bucket under its lock

#### Scenario: A downloaded Node runtime is bucketed
- **WHEN** bootstrap downloads a Node runtime
- **THEN** the runtime lands in a version-keyed bucket and the record names that bucket

#### Scenario: A host Node runtime is recorded without a bucket
- **WHEN** the host already provides a qualifying Node runtime
- **THEN** the record names that path with a host source and no Node bucket is created

#### Scenario: Chromium is keyed by the Playwright version
- **WHEN** Chromium is prepared
- **THEN** the bucket key is the Playwright version and the marker records the Chromium, headless-shell and ffmpeg revisions

### Requirement: The pnpm bucket follows the project pin
The pnpm bucket SHALL install the exact version that `project-invariants` pins and SHALL NOT fall back to a host pnpm. Bootstrap SHALL run the bucket's entry with the recorded Node, and SHALL fail preparation when the installed version differs from the pin.

#### Scenario: A host pnpm is ignored
- **WHEN** the host provides a pnpm version other than the pin
- **THEN** bootstrap still prepares and uses the pinned bucket

#### Scenario: A version mismatch fails
- **WHEN** the bucket reports a version other than the pin
- **THEN** preparation fails and writes no record

#### Scenario: The recorded Node runs the recorded pnpm
- **WHEN** a consumer runs the recorded pnpm
- **THEN** it invokes the bucket entry with the recorded Node

### Requirement: Deps-only bootstrap prepares without the full gate
Bootstrap SHALL accept `--deps-only` to resolve the shared root and Node, prepare the pnpm bucket, install locked dependencies when absent, reuse or install the Chromium bucket, write the record, and then attempt bucket collection. It SHALL skip Git hook installation, the lab doctor and tests. A preparation step that fails before the record write SHALL write no record. Without the flag the existing full sequence SHALL remain.

#### Scenario: Deps-only prepares the record
- **WHEN** bootstrap runs with `--deps-only`
- **THEN** the pnpm bucket, `node_modules` and the record exist
- **AND** hook installation, the lab doctor and tests did not run

#### Scenario: Deps-only reuses complete state
- **WHEN** `node_modules` and the bucket are complete
- **THEN** no install step runs

#### Scenario: A failed deps-only run leaves no record
- **WHEN** a preparation step before the record write fails
- **THEN** the run exits nonzero and writes no record

#### Scenario: The full run is unchanged
- **WHEN** bootstrap runs without `--deps-only`
- **THEN** its existing steps still run

### Requirement: A collection abort does not fail preparation
A bucket collection abort SHALL delete nothing, SHALL report the record that caused it, and SHALL leave the record and the preparation that triggered it successful.

#### Scenario: A corrupt record does not roll back preparation
- **WHEN** collection aborts because another worktree's record cannot be read
- **THEN** the preparation's record remains and the run succeeds
- **AND** the aborted collection deletes nothing and names the unreadable record

### Requirement: Bucket collection follows worktree references
Bucket collection SHALL enumerate every git worktree, read each worktree's own record, and delete a bucket only when no record references it, no bucket lock is held, and the bucket is older than one hour. It SHALL be the only cross-worktree reader of records, abort without deleting on a corrupt record, never delete a bucket referenced by the current worktree, and leave the preparation that triggered it successful when it aborts.

#### Scenario: A referenced bucket is kept
- **WHEN** any worktree record references a bucket
- **THEN** collection keeps it

#### Scenario: An unreferenced bucket is deleted
- **WHEN** no record references a bucket, no lock is held and it is older than one hour
- **THEN** collection deletes it

#### Scenario: A young or locked bucket is kept
- **WHEN** a bucket is younger than one hour or holds a lock
- **THEN** collection keeps it

#### Scenario: A missing worktree directory is reported
- **WHEN** a listed worktree has no directory
- **THEN** collection reports it and treats it as no reference

#### Scenario: Collection can be reported without deleting
- **WHEN** bootstrap is asked for a dry run or to skip collection
- **THEN** it reports the candidates or skips collection

### Requirement: Consumers use the current worktree record
The lab's pnpm and browser checks and plugin installation, and the pre-push hook's Node selection, SHALL read the current worktree's record. When it is current they SHALL use its paths and SHALL NOT fall back to `PATH`; when it is absent they SHALL use `PATH` and verify the pnpm version against the pin; when it is stale they SHALL fail with the recorded correction. They SHALL NOT read another worktree's record.

#### Scenario: A stale record is refused
- **WHEN** a consumer finds the record's inputs no longer match
- **THEN** it fails and names the correction for the changed input
- **AND** it does not use the recorded paths

#### Scenario: The lab uses the recorded pnpm
- **WHEN** the current worktree has a record
- **THEN** the doctor and plugin installation use its pnpm and Node

#### Scenario: The lab without a record uses PATH
- **WHEN** no record exists
- **THEN** the doctor and installation use `PATH`
- **AND** they fail when pnpm is absent or is not the pinned version

#### Scenario: The hook prepends the recorded Node
- **WHEN** a push starts in a worktree with a record
- **THEN** the hook puts the recorded Node first on `PATH`

#### Scenario: The hook without a record keeps PATH
- **WHEN** no record exists
- **THEN** the hook leaves `PATH` unchanged

#### Scenario: A missing recorded path is an error
- **WHEN** the record exists but a recorded pnpm or Node path is missing
- **THEN** the consumer fails and asks for a new preparation
- **AND** it does not fall back to `PATH`
