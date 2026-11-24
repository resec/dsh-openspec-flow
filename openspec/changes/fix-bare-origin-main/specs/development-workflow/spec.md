# Spec Delta

## MODIFIED Requirements

### Requirement: Landed push reconciles the remote and is idempotent

The script SHALL use the repository's `origin` remote. Before deciding, it SHALL fetch `origin`'s main; a dry run SHALL perform the fetch too. It SHALL report success without pushing when the remote main equals `HEAD`, push only when the remote main is an ancestor of `HEAD`, and refuse a remote main ahead of `HEAD`, a diverged history or a missing remote main. A push SHALL invoke the pre-push hook and SHALL NOT pass `--no-verify` or push any ref other than `main`.

#### Scenario: Remote already contains the landed commit

- **WHEN** the fetched remote main equals `HEAD`
- **THEN** the script reports that nothing needs pushing and exits successfully without a push

#### Scenario: Remote is behind

- **WHEN** the fetched remote main is an ancestor of `HEAD`
- **THEN** an explicit `--push` pushes `HEAD` to the remote main

#### Scenario: Remote is ahead

- **WHEN** the fetched remote main contains commits not in `HEAD`
- **THEN** the script fails and asks for local reconciliation instead of force-pushing

#### Scenario: Histories diverged

- **WHEN** neither side is an ancestor of the other
- **THEN** the script fails and does not push

#### Scenario: Remote main is missing

- **WHEN** `origin` has no main branch
- **THEN** the script fails and names the missing remote ref

#### Scenario: Dry run fetches but does not push

- **WHEN** the script runs without `--push`
- **THEN** it fetches `origin` main to report the remote state and performs no push

#### Scenario: Pre-push gate runs

- **WHEN** `--push` executes
- **THEN** the repository's pre-push hook runs and the script does not bypass it

#### Scenario: A local branch shares the remote main's short name

- **WHEN** a local branch named `origin/main` points at a different commit than the fetched remote main
- **THEN** the script decides on `refs/remotes/origin/main` and ignores the local branch
