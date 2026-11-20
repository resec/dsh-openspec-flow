# Spec Delta

## MODIFIED Requirements

### Requirement: Packaging produces one tarball and its metadata

The packaging entrypoint SHALL publish the package manifest's published file set as `<name>-<version>.tgz` under the repository `dist/` directory and SHALL write `<name>-<version>.json` beside it. The metadata SHALL record the package name, the version, the file name, the tarball's sha512, its byte size, its file count, the `HEAD` revision, whether the packed content differed from `HEAD` and the packed-at timestamp.

#### Scenario: A clean tree is packed

- **WHEN** the entrypoint runs on a clean working tree whose version has no packed artifact yet
- **THEN** `dist/` holds the tarball and a metadata file naming the `HEAD` revision

#### Scenario: The packed file set follows the manifest

- **WHEN** the manifest's published file list changes
- **THEN** the next tarball carries that list and the metadata's file count reflects it

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
