# Specification Delta

## MODIFIED Requirements

### Requirement: Offline local completion

When GitHub is unreachable, the local flow SHALL NOT publish a pull request. After apply review and a passing `npm run test:lab -- --mock-only`, the maintainer SHALL run `openspec_apply_worktree action=land` with user approval, archive, record the offline land, and stop at local `main` without a push. A local owner entry that exists SHALL record `landed-offline` through `pr-local-land finish`.

#### Scenario: Offline land completes locally

- **WHEN** GitHub is unreachable, the apply review is passed and the local lab passes
- **THEN** the maintainer lands locally, the change is archived, the offline land is recorded and local `main` reaches the archive commit without a push

#### Scenario: A local owner entry records the fallback

- **WHEN** a published local pull request falls back to the offline land and has a local owner entry
- **THEN** `pr-local-land finish` records `landed-offline`

### Requirement: Offline deferred push

When GitHub returns, `push-landed --push --offline` SHALL publish the deferred commits after the offline land is recorded, and the local entry SHALL record `pushed` through `pr-local-land finish`. A published local pull request that falls back SHALL record `landed-offline` through `pr-local-land finish` after the local land. Local `main` leading `origin/main` SHALL block a new online pull request and contributor landing until the deferred push completes.

#### Scenario: Deferred push

- **WHEN** GitHub is reachable again and local `main` leads `origin/main`
- **THEN** `push-landed --push --offline` publishes the deferred land and archive commits after the offline land is recorded
- **AND** `pr-local-land finish` records `pushed`

#### Scenario: Local main leads origin/main

- **WHEN** a contributor landing or a new online pull request is attempted while local `main` leads `origin/main`
- **THEN** the operation refuses and names `push-landed`

#### Scenario: Published pull request falls back offline

- **WHEN** a local pull request is published but not merged and GitHub becomes unreachable
- **THEN** the owner may land the same reviewed worktree locally
- **AND** `pr-local-land finish` records `landed-offline`
- **AND** the open pull request is left for reconciliation after the deferred push
