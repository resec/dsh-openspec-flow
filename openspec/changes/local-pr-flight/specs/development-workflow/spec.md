# Spec Delta

## ADDED Requirements

### Requirement: Online local completion via pull request

After apply review, a maintainer-authored change SHALL publish a pull request, wait for green CI, merge it with `gh pr merge --rebase`, retarget the reviewed worktree to the merge commit after verifying the merge tree equals the reviewed tree, and run `openspec_apply_worktree action=land`. Land SHALL archive, commit, write the manifest and remove the worktree and branch. The maintainer SHALL push the archive commit with `push-landed`. The implementation SHALL NOT be pushed directly to `main`.

#### Scenario: A maintainer change is published

- **WHEN** the apply review is passed and the publish gates pass
- **THEN** the reviewed branch is pushed and a draft pull request is opened and marked ready

#### Scenario: The local pull request is merged

- **WHEN** CI is green, the head contains `origin/main` and the reviewed tree matches
- **THEN** the owner merges the pull request with `gh pr merge --rebase`

#### Scenario: The reviewed worktree is retargeted

- **WHEN** the merge commit tree equals the reviewed tree
- **THEN** the owner resets the worktree branch to the merge commit and runs `openspec_apply_worktree action=land`

#### Scenario: The archive commit is pushed

- **WHEN** land has archived the change and written the manifest
- **THEN** `push-landed --push` publishes the archive commit

### Requirement: Offline local completion

When GitHub is unreachable, a maintainer-authored change SHALL NOT publish a pull request. After apply review and a passing `npm run test:lab -- --mock-only`, it SHALL run `openspec_apply_worktree action=land` with user approval, archive and stop at local `main` without a push. When GitHub returns, `push-landed` SHALL publish the deferred commits. Local `main` leading `origin/main` SHALL block a new online pull request until the deferred push completes.

#### Scenario: Offline land completes at local main

- **WHEN** GitHub is unreachable, the apply review is passed and the local lab passes
- **THEN** land archives the change and local `main` reaches the archive commit
- **AND** no push runs

#### Scenario: Deferred push

- **WHEN** GitHub is reachable and local `main` leads `origin/main`
- **THEN** `push-landed --push` publishes the deferred land and archive commits

#### Scenario: Local main leads origin/main

- **WHEN** a new online pull request is attempted while local `main` leads `origin/main`
- **THEN** the publish command refuses and names `push-landed`

### Requirement: Maintainer pull-request archive ordering

A maintainer pull request SHALL be archived after its implementation is merged and before the archive commit is pushed to `origin/main`. The owner SHALL retarget the reviewed worktree to the merge commit, land, and push the archive commit. An offline land SHALL archive before its deferred push. The implementation SHALL NOT be pushed directly before the archive.

#### Scenario: An online maintainer pull request is archived

- **WHEN** a maintainer pull request is merged and landed
- **THEN** the archive commit follows the merged implementation
- **AND** the owner pushes the archive commit after land

#### Scenario: An offline land defers the push

- **WHEN** GitHub is unreachable and a maintainer change is landed locally
- **THEN** the land and archive commits stay local
- **AND** `push-landed` publishes them after GitHub returns

## MODIFIED Requirements

### Requirement: Archive precedes commit and push

The repository SHALL archive a change before the archive commit is pushed to `origin/main`, so the archive commit carries the merged specs. A maintainer-authored change SHALL be archived before its implementation is pushed directly to `main`. An external contribution MAY merge its active change through a pull request; the maintainer SHALL archive it after merge, and the archive commit SHALL follow the apply review.

#### Scenario: A change is archived

- **WHEN** `openspec_archive` completes for a change
- **THEN** a single commit records the archive, its documentation updates, and the merged specs, and that commit is pushed to `origin/main`

#### Scenario: A change is not yet archived

- **WHEN** a maintainer-authored change's tasks are incomplete or `openspec_validate` fails
- **THEN** no archive commit is created and no implementation from that change is pushed directly to `main`

#### Scenario: An external contribution is merged before archive

- **WHEN** an external pull request carrying an active change is merged
- **THEN** the merge commit carries the active change
- **AND** the maintainer archives it after merge
- **AND** the archive commit follows the apply review

### Requirement: Strict artifact validation gate

A main-only push SHALL validate main specs and archived tasks with warnings as failures, and SHALL proceed only when every active change reports `in-progress`. Any other push SHALL validate every active change, main spec, and archived tasks the same way. Validation SHALL precede `npm run verify`; a validation failure SHALL block the push. The local hook SHALL NOT run the lab scenarios; the remote `lab` CI job SHALL guard pull requests and `main`.

#### Scenario: Artifacts pass strict validation

- **WHEN** every active change and main spec passes strict validation and every archived change has all tasks checked
- **THEN** the hook continues to the coverage step

#### Scenario: A main-only push ignores an in-progress change

- **WHEN** a push targets only `refs/heads/main` and an active change reports `in-progress`
- **THEN** the hook validates main specs and archived tasks
- **AND** the hook does not validate that active change
- **AND** the hook continues to the coverage step

#### Scenario: A main-only push blocks a complete change

- **WHEN** a push targets only `refs/heads/main` and an active change reports `complete`
- **THEN** the hook exits nonzero before the coverage step
- **AND** it names the change to archive or land

#### Scenario: A main-only push blocks a task-less change

- **WHEN** a push targets only `refs/heads/main` and an active change reports `no-tasks`
- **THEN** the hook exits nonzero before the coverage step
- **AND** it names the task-less change

#### Scenario: A main-only push blocks an unknown status

- **WHEN** a push targets only `refs/heads/main` and an active change reports a status other than `in-progress`, `complete` or `no-tasks`
- **THEN** the hook exits nonzero before the coverage step
- **AND** it names the change and the unrecognized status

#### Scenario: A non-main push validates a complete change

- **WHEN** a push targets a ref other than `refs/heads/main` and its complete active change passes strict validation
- **THEN** the hook runs the full validation
- **AND** it continues to the coverage step

#### Scenario: A mixed push validates every active change

- **WHEN** a push targets `refs/heads/main` and another ref
- **THEN** the hook runs the full validation over every active change

#### Scenario: A warning exists

- **WHEN** a main spec reports a warning, or a non-main push's active change reports a warning
- **THEN** the hook exits nonzero and the push is blocked

#### Scenario: An archived change has unfinished tasks

- **WHEN** an archived change has unchecked tasks
- **THEN** the hook exits nonzero and the push is blocked

#### Scenario: The active-change listing is unreadable

- **WHEN** the main-only gate cannot read the active-change status
- **THEN** the hook exits nonzero before the coverage step

#### Scenario: Coverage is skipped

- **WHEN** `COVERAGE_SKIP=1` is set
- **THEN** strict validation still runs before the hook exits

#### Scenario: A verifying stamp skips verification after validation

- **WHEN** strict validation passes and the coverage stamp verifies
- **THEN** the hook skips `npm run verify`
- **AND** strict validation has already run

#### Scenario: An unverified stamp runs verification after validation

- **WHEN** strict validation passes and the coverage stamp does not verify
- **THEN** the hook runs `npm run verify`

#### Scenario: The bundled CLI is unavailable

- **WHEN** the hook cannot execute the bundled OpenSpec CLI
- **THEN** it reports the missing executable and the push is blocked

#### Scenario: Lab scenarios pass before verification

- **WHEN** the remote `lab` job passes for the same pull request and strict validation also passes
- **THEN** the pull request satisfies both the local validation and the remote lab gate

#### Scenario: A lab scenario fails

- **WHEN** the remote `lab` job fails
- **THEN** the pull request is blocked by the required check
- **AND** the local hook still runs strict validation

#### Scenario: Coverage is skipped but the lab gate runs

- **WHEN** `COVERAGE_SKIP=1` is set
- **THEN** strict validation still runs and the remote `lab` job remains the lab gate

#### Scenario: The hook does not run lab scenarios

- **WHEN** strict validation passes
- **THEN** the hook continues to the coverage step without running `npm run test:lab`

#### Scenario: Remote lab guards pull requests and main

- **WHEN** a pull request or a push to `main` starts remote CI
- **THEN** the `lab` job runs the reusable DSH scenarios

### Requirement: Coverage stamp verification

After strict validation, the pre-push hook SHALL skip only the `npm run verify` rerun when the coverage stamp verifies as `coverage-gate` defines it. Except for `COVERAGE_SKIP=1`, any other stamp outcome SHALL run verification.

#### Scenario: A verifying stamp skips only the verification rerun

- **WHEN** strict validation passes and the coverage stamp verifies
- **THEN** the hook skips `npm run verify`
- **AND** strict validation has already run

#### Scenario: A non-verifying stamp runs verification

- **WHEN** strict validation passes and the coverage stamp does not verify
- **THEN** the hook runs `npm run verify`

### Requirement: Land sequences the land and archive commits

A maintainer worktree apply SHALL land as a fast-forward commit that carries the implementation and its documentation, followed by an archive commit that carries the archive and merged specs. In the online path the land commit is the pull-request merge commit, already on `origin/main`; in the offline path it is the reviewed local head. Both SHALL precede the archive push. Land SHALL NOT create a merge commit.

#### Scenario: A worktree change is landed

- **WHEN** `openspec_apply_worktree action=land` completes for an offline change
- **THEN** the land commit carries the implementation and its documentation
- **AND** the archive commit carries the archive and merged specs
- **AND** the two commits form a linear history
- **AND** both are pushed together after the archive commit

#### Scenario: An online worktree change is landed

- **WHEN** the reviewed worktree is retargeted to the pull-request merge commit and landed
- **THEN** the land commit is the merge commit already on `origin/main`
- **AND** the archive commit follows it locally
- **AND** only the archive commit is pushed after land

#### Scenario: Land creates no merge commit

- **WHEN** a maintainer worktree change lands
- **THEN** land does not create a merge commit on `main`

### Requirement: Agent instructions scope the push path to the maintainer

`AGENTS.md` SHALL state the online pull-request completion path, the offline land path, the retarget step, and that the post-archive push to `origin/main` is the maintainer's step. An external contribution stops at its pull request. The archive step SHALL NOT read as an instruction for an external contributor to push.

#### Scenario: An external contributor reads the workflow

- **WHEN** an external contributor follows `AGENTS.md`
- **THEN** the push step names the maintainer as its owner
- **AND** the contributor follows `CONTRIBUTING.md` and stops at the pull request

#### Scenario: The maintainer archives a change

- **WHEN** the maintainer archives a change
- **THEN** the maintainer commits the archive and pushes `origin/main`

#### Scenario: The maintainer completes a change online

- **WHEN** the maintainer follows the online path
- **THEN** `AGENTS.md` names the pull request, retarget, land and archive push as the maintainer's steps

#### Scenario: The maintainer completes a change offline

- **WHEN** the maintainer follows the offline path
- **THEN** `AGENTS.md` names the local lab, land, archive and deferred push
