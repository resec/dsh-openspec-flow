# Specification Delta

## ADDED Requirements

### Requirement: Landed push requires a merged or recorded offline land

`push-landed` SHALL inspect every manifest whose resolved land commit or archive commit lies in the fetched `origin/main..HEAD` range before a dry run or a push. Each such land commit SHALL already be an ancestor of `origin/main`, unless the change has a recorded `landed-offline` phase or a matching offline-land record and the caller passes `--offline`. Plain reviewed commits in the range SHALL NOT be refused. The flag alone SHALL NOT authorize the push.

#### Scenario: A direct worktree land is refused

- **WHEN** a manifest's land commit is not on `origin/main` and the change has no `landed-offline` phase or offline-land record
- **THEN** both the dry run and `--push` fail and name the manifest and the unmerged land commit
- **AND** `origin/main` is unchanged

#### Scenario: An online merge is pushed

- **WHEN** the manifest's land commit is already on `origin/main` and the remaining range is the archive commit
- **THEN** the dry run reports the archive-only range
- **AND** `--push` publishes only the archive commit

#### Scenario: A recorded offline land is deferred

- **WHEN** the change has a matching offline-land record or a `landed-offline` local phase and the caller passes `--offline`
- **THEN** the dry run reports the deferred land and archive commits
- **AND** `--push` publishes them

#### Scenario: A multi-commit reviewed branch is deferred

- **WHEN** the offline range contains reviewed commits between `origin/main` and the recorded land commit and the record plus `--offline` match
- **THEN** the plain reviewed commits do not refuse the push
- **AND** the deferred land and archive commits are published

#### Scenario: The offline flag is missing

- **WHEN** an offline record or `landed-offline` phase exists but the caller omits `--offline`
- **THEN** the script refuses and names `--offline`

#### Scenario: The push range contains an earlier direct land

- **WHEN** the selected manifest is merged but the range also contains an earlier committed land that is not on `origin/main`
- **THEN** the script refuses before pushing

#### Scenario: A non-worktree commit does not block

- **WHEN** the range contains a plain commit from the documented non-worktree push and no manifest land commit is unmerged
- **THEN** the script does not refuse the range for that commit

### Requirement: Pre-push refuses an unmerged landed push

A push that includes `refs/heads/main` SHALL apply the landed-range rule after artifact validation and before the coverage step. A push whose range contains an unmerged land commit SHALL exit nonzero without running the coverage check. A range with no manifest-backed commit SHALL keep the existing non-worktree path. A recorded offline range SHALL pass only when `push-landed --offline` marked the push.

#### Scenario: A direct land is blocked by the hook

- **WHEN** a push includes `refs/heads/main` and the range contains a manifest land commit not on the remote main
- **THEN** the hook exits nonzero before the coverage step
- **AND** it names the change and the remedy

#### Scenario: An online archive reaches the coverage step

- **WHEN** a push includes `refs/heads/main` and every manifest-backed commit is already merged
- **THEN** the hook continues to the coverage step

#### Scenario: A raw offline push is refused

- **WHEN** a push includes an offline-landed manifest without the marker set by `push-landed --offline`
- **THEN** the hook exits nonzero and names `push-landed --offline`

#### Scenario: The marked offline push passes

- **WHEN** `push-landed --offline` marks the push after verifying the offline record
- **THEN** the hook continues to the coverage step

#### Scenario: A non-worktree main push keeps its path

- **WHEN** the range has no manifest-backed commit
- **THEN** the hook continues with the existing validation and coverage behavior

### Requirement: Offline land record

An offline land with no local owner entry SHALL be recorded with `offline-land record`, keyed by the manifest's resolved land commit, after verifying the manifest, main `HEAD`, archive commit, reviewed tree and user approval. `push-landed --offline` SHALL accept that record or an existing `landed-offline` phase; a bare `--offline` SHALL be refused. A published but unmerged pull request MAY record `landed-offline` through `pr-local-land finish`.

#### Scenario: A pre-publish offline land is recorded

- **WHEN** a land has no local owner entry and the maintainer records its change and land commit with user approval
- **THEN** the record names the change, archive commit, reviewed tree and land commit
- **AND** the record is written only under `.cache/pr-review/offline-lands.json`

#### Scenario: A mismatched record is refused

- **WHEN** the record's archive commit, reviewed tree or land commit differs from the selected manifest
- **THEN** the record is refused and nothing is written

#### Scenario: The flag alone does not authorize

- **WHEN** `push-landed --offline` runs without a matching record or `landed-offline` phase
- **THEN** the script refuses and does not push

#### Scenario: A published but unmerged pull request is accepted

- **WHEN** the local owner entry is `landed-offline` after the published pull request falls back to the offline land
- **THEN** `push-landed --offline` accepts the phase without a separate record

#### Scenario: The record is cleared after the push

- **WHEN** the deferred push succeeds
- **THEN** the matching offline record is removed

### Requirement: Offline push documentation

`docs/land-push.md` SHALL document the `--offline` mode, the offline-land record, the landed-range gate, the pre-push range check, and recovery for a refused unmerged land. `docs/local-pr.md` SHALL document the record and deferred-push commands. `AGENTS.md` SHALL name the offline record and `push-landed --push --offline`.

#### Scenario: The deferred route is documented

- **WHEN** a maintainer reads the online and offline completion sections
- **THEN** the documents name the lab, land, `offline-land record`, stop and `push-landed --push --offline`
- **AND** they state that the matching record is removed after the push

#### Scenario: The hook refusal is documented

- **WHEN** a maintainer reads the pre-push section
- **THEN** it names the direct-land refusal and the `offline-land record` plus `push-landed --push --offline` recovery commands

#### Scenario: Recovery is documented

- **WHEN** a direct land is refused at the push boundary
- **THEN** the documents name the manual recovery and the offline record path

## MODIFIED Requirements

### Requirement: Landed push reconciles the remote and is idempotent

The script SHALL use the repository's `origin` remote. Before deciding, it SHALL fetch `origin`'s main; a dry run SHALL perform the fetch too. It SHALL report success without pushing when the remote main equals `HEAD`, push only when the remote main is an ancestor of `HEAD`, and refuse a remote main ahead of `HEAD`, a diverged history or a missing remote main. A push SHALL invoke the pre-push hook and SHALL NOT pass `--no-verify` or push any ref other than `main`.

#### Scenario: Remote already contains the landed commit

- **WHEN** the fetched remote main equals `HEAD`
- **THEN** the script reports that nothing needs pushing and exits successfully without a push

#### Scenario: Remote is behind

- **WHEN** the fetched remote main is an ancestor of `HEAD` and every new commit passes the landed-range requirement
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

### Requirement: Offline local completion

When GitHub is unreachable, a maintainer change SHALL NOT publish a pull request. After apply review and a passing `npm run test:lab -- --mock-only`, it SHALL run `openspec_apply_worktree action=land` with user approval, archive and stop at local `main` without a push. When GitHub returns, `push-landed --push --offline` SHALL publish the deferred commits after the offline land is recorded. Local `main` leading `origin/main` SHALL block a new online pull request until the deferred push completes.

#### Scenario: Offline land completes at local main

- **WHEN** GitHub is unreachable, the apply review is passed and the local lab passes
- **THEN** land archives the change and local `main` reaches the archive commit
- **AND** no push runs

#### Scenario: Deferred push

- **WHEN** GitHub is reachable and local `main` leads `origin/main`
- **THEN** `push-landed --push --offline` publishes the deferred land and archive commits after the offline land is recorded

#### Scenario: Local main leads origin/main

- **WHEN** a new online pull request is attempted while local `main` leads `origin/main`
- **THEN** the publish command refuses and names `push-landed`
