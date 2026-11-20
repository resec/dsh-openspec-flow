# Spec Delta

## MODIFIED Requirements

### Requirement: Packaging refuses a dirty working tree

The packaging entrypoint SHALL refuse to pack when uncommitted changes exist outside `openspec/`, and SHALL treat a rename by both of its paths. Uncommitted changes under `openspec/` SHALL NOT block packing, because they cannot enter the tarball: the published file list excludes that directory and the content check rejects it. The entrypoint SHALL name the blocking paths, report ignored `openspec/` paths, and exit nonzero only when a blocking path exists.

#### Scenario: A clean tree is accepted

- **WHEN** the working tree is clean and no artifact exists for the version
- **THEN** the entrypoint packs the tarball and writes the metadata

#### Scenario: Untracked or modified files block packing

- **WHEN** the working tree holds a modified or untracked file outside `openspec/`
- **THEN** the entrypoint packs nothing, names the blocking paths and exits nonzero

#### Scenario: Only OpenSpec paths are uncommitted

- **WHEN** the only uncommitted paths are under `openspec/` and no artifact exists for the version
- **THEN** the entrypoint packs the tarball with the metadata's `revision` at `HEAD` and its `dirty` flag false, reports those paths as ignored, and the tarball carries no `openspec/` path

#### Scenario: A published file is moved under OpenSpec

- **WHEN** a tracked published file is renamed into `openspec/` and nothing else is uncommitted
- **THEN** the entrypoint packs nothing, names the published side of the rename and exits nonzero
