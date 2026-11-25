# Spec Delta

## MODIFIED Requirements

### Requirement: Packaging produces one tarball and its metadata

The packaging entrypoint SHALL publish the package manifest's published file set as `<name>-<version>.tgz` inside the version directory `dist/<name>-<version>/` and SHALL write `<name>-<version>.json` beside it. The metadata SHALL record the package name, the version, the file name, the tarball's sha512, its byte size, its file count, the `HEAD` revision, whether the packed content differed from `HEAD` and the packed-at timestamp.

#### Scenario: A clean tree is packed

- **WHEN** the entrypoint runs on a clean working tree whose version has no packed artifact yet
- **THEN** `dist/<name>-<version>/` holds the tarball and a metadata file naming the `HEAD` revision

#### Scenario: The packed file set follows the manifest

- **WHEN** the manifest's published file list changes
- **THEN** the next tarball carries that list and the metadata's file count reflects it
