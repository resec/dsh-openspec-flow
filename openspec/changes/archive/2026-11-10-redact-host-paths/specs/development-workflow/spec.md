# Spec Delta: development-workflow

## ADDED Requirements

### Requirement: Repository content and history exclude host paths

The repository SHALL NOT track, publish, or retain in reachable history any host-specific absolute path, including a home directory, user name, private harness profile, or workspace toolchain path.

#### Scenario: A tracked file still has a host path

- **WHEN** a tracked file contains `/home/<user>/`, `/Users/<user>/`, or `/root/`
- **THEN** the redaction is incomplete and the change is not ready to archive

#### Scenario: Reachable history is audited

- **WHEN** every reachable commit is scanned, including decompressed binary fixtures
- **THEN** no commit contains a host-specific absolute path

#### Scenario: History is rewritten

- **WHEN** reachable history is rewritten to remove host paths
- **THEN** each rewritten commit keeps its author, committer, dates and message
