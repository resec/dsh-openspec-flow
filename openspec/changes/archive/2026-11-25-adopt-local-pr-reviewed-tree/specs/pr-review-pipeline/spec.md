# Spec Delta: adopt a re-reviewed local pull-request tree

## ADDED Requirements

### Requirement: Local reviewed-tree adoption

`scripts/pr-local-land.mjs adopt` SHALL default to a dry run and write only with `--apply`. Given an explicit `--tree`, it SHALL require the entry's owner session, refuse a `pushed` entry, verify a passed apply review for the tree, and require corroboration by the current worktree head tree, a landed manifest whose archive commit is `main`, or the merged pull-request tree on `origin/main`. It SHALL update the entry's `head` and `tree`, clear the error and leave the phase unchanged.

#### Scenario: Dry run writes nothing

- **WHEN** adopt runs without `--apply`
- **THEN** it reports the previous and adopted head and tree
- **AND** it writes no local state

#### Scenario: Worktree head corroborates the tree

- **WHEN** no landed manifest on `main` or merged pull request names another tree, the plugin worktree is clean, and its `HEAD^{tree}` equals `--tree`
- **THEN** adopt records that `HEAD` as the entry head and the tree
- **AND** it clears the entry error

#### Scenario: A landed manifest corroborates the tree

- **WHEN** the plugin worktree is gone, a landed manifest for the change has `featureTree` equal to `--tree`, and its archive commit is `main`
- **THEN** adopt records the manifest's feature head and tree

#### Scenario: A merged pull request corroborates the tree

- **WHEN** the pull request is merged, `origin/main` is its merge commit, and the merge commit tree equals `--tree`
- **THEN** adopt records the merge commit and the tree

#### Scenario: A tree without a passed review is refused

- **WHEN** the apply review is not passed, its `treeSha` differs from `--tree`, or it has an open finding
- **THEN** adopt refuses and writes nothing

#### Scenario: A tree without a current source is refused

- **WHEN** no worktree, landed manifest or merged pull request corroborates `--tree`
- **THEN** adopt refuses and names the sources it checked

#### Scenario: A pushed entry and another owner are refused

- **WHEN** the entry phase is `pushed` or the session differs from the recorded owner
- **THEN** adopt refuses without writing

#### Scenario: Adoption leaves the phase unchanged

- **WHEN** adopt succeeds for an entry in `published`, `merged`, `retargeted`, `landed`, `landed-offline` or `failed`
- **THEN** the phase is unchanged
- **AND** the recorded error is cleared

### Requirement: Local reviewed-tree adoption documentation

`docs/local-pr.md` SHALL document the `adopt` command, its dry run, its validation sources and its order before `verify`, `retarget`, `land` or `finish`. `AGENTS.md` SHALL name the adopt step in the maintainer completion path.

#### Scenario: The adoption route is documented

- **WHEN** a maintainer reads the local pull-request completion guide
- **THEN** it names `pr-local-land adopt`, the explicit tree and the dry run
- **AND** it states that adoption precedes retarget when the merged tree changed and precedes finish when the landed manifest names another tree

### Requirement: Local adoption source precedence

The landed manifest on `main` SHALL take precedence over the merged pull request, and the merged pull request SHALL take precedence over the apply worktree. When a manifest for the change on `main` or a merged pull request names a tree other than `--tree`, adoption SHALL refuse even when the worktree carries `--tree`.

#### Scenario: A merged tree that did not land is refused

- **WHEN** the pull request is merged with a tree other than `--tree` and the worktree head tree is `--tree`
- **THEN** adopt refuses and names the merged tree

#### Scenario: A main manifest naming another tree is refused

- **WHEN** a landed manifest for the change on `main` names a tree other than `--tree`
- **THEN** adopt refuses and names the manifest tree

#### Scenario: The highest-precedence source records the head

- **WHEN** a landed manifest and the worktree both corroborate `--tree`
- **THEN** adopt records the manifest's feature head

### Requirement: Local mismatch guidance

`pr-local-land verify` SHALL refuse a merged tree that differs from the recorded reviewed tree and name the merged tree and the exact `adopt` command. `pr-local-land finish` SHALL name the landed manifest tree and the `adopt` command when a manifest for the change on `main` carries another tree.

#### Scenario: Verify names adoption

- **WHEN** verify finds a merged tree that differs from the recorded reviewed tree
- **THEN** the refusal names the merged tree and the `adopt` command with the recorded owner session

#### Scenario: Finish names adoption

- **WHEN** finish finds no manifest for the recorded tree and a manifest for the same change on `main` names another tree
- **THEN** the refusal names that manifest tree and the `adopt` command

## MODIFIED Requirements

### Requirement: Local pull-request landing

The owner session SHALL merge a local pull request only when the head contains the current `origin/main`, CI is green, the apply review is passed and its `treeSha` equals the head tree. It SHALL run `gh pr merge --rebase`. After the merge, the recorded reviewed tree SHALL equal the merge commit tree; when it differs, the owner SHALL re-review the merged tree and adopt it before retargeting or landing. It SHALL not require a `mergeable` label or a trusted pass comment.

#### Scenario: Up-to-date local pull request is merged

- **WHEN** the head contains `origin/main`, CI is green and the reviewed tree equals the head tree
- **THEN** the owner merges with `gh pr merge --rebase`
- **AND** it verifies the merge commit tree equals the recorded reviewed tree

#### Scenario: Behind head is rebased and re-reviewed

- **WHEN** the head does not contain `origin/main`
- **THEN** the owner rebases the worktree, runs `npm run verify`, resumes the apply review in the same session, pushes the new head and waits for green CI before merging

#### Scenario: Tree mismatch blocks the merge record

- **WHEN** the merge commit tree differs from the recorded reviewed tree
- **THEN** the owner re-reviews the merged tree and adopts it through `pr-local-land adopt` before retargeting
- **AND** it does not archive or land while the passed apply review names a different tree

#### Scenario: No label is required

- **WHEN** a local pull request has no `mergeable` label and no trusted pass comment
- **THEN** the owner may still merge it after the local gates pass

### Requirement: Local worktree retarget and land

After the merge, the owner SHALL verify `origin/main` is the merge commit, reset the plugin worktree branch to that commit, and confirm its tree still equals the reviewed tree. It SHALL then run `openspec_apply_worktree action=land` with user approval; land SHALL fast-forward `main` to the merge commit, archive, commit, write the manifest and remove the worktree and branch. The owner SHALL push the archive commit with `push-landed` and SHALL record `pushed` through `pr-local-land finish`.

#### Scenario: Retarget keeps the reviewed tree

- **WHEN** `origin/main` is the merge commit and the worktree is clean
- **THEN** the owner resets the worktree branch to the merge commit
- **AND** `HEAD^{tree}` still equals the reviewed tree

#### Scenario: A changed merged tree is adopted before retarget

- **WHEN** the merge commit tree differs from the recorded reviewed tree and the merged tree has a passed apply review
- **THEN** the owner adopts the tree through `pr-local-land adopt` and retargets only after the adoption

#### Scenario: Land completes the change

- **WHEN** the retargeted worktree is landed
- **THEN** `land` fast-forwards `main` to the merge commit, archives the change, writes the manifest and removes the worktree and branch

#### Scenario: Push publishes only the archive commit

- **WHEN** the land commit is already on `origin/main`
- **THEN** `push-landed --push` publishes only the archive commit
- **AND** `pr-local-land finish` records the entry phase `pushed`

### Requirement: Merged local pull-request recovery

A merged local pull request whose owner session stopped SHALL be reported by the watch with its number, phase and recorded session. A user-approved recovery session SHALL verify the merge commit and tree, retarget, land and push, and SHALL run `openspec_apply_worktree action=recover` first when the change lock is held by a dead process; `pr-local-land finish` SHALL record `pushed` after the push. The unattended watch SHALL NOT review, retarget, land or merge a local pull request.

#### Scenario: Watch reports a stopped local landing

- **WHEN** a local pull request is merged and its local entry is not landed or pushed
- **THEN** the watch reports the pull request, phase and session and stops without landing it

#### Scenario: Recovery session completes the landing

- **WHEN** a user approves recovery for a merged local pull request
- **THEN** the session verifies the merge commit and tree, retargets, lands and pushes

#### Scenario: Recovery plans adoption

- **WHEN** recovery finds a merged tree that differs from the recorded reviewed tree and has a passed apply review
- **THEN** `pr-local-land recover` lists the adopt step before retarget

#### Scenario: Recovery refuses an unreviewed merged tree

- **WHEN** the merged tree differs from the recorded reviewed tree and no passed apply review names it
- **THEN** recovery refuses and lists no adopt step

#### Scenario: Dead change lock is recovered first

- **WHEN** recovery finds the change lock held by a dead process
- **THEN** the session recovers it with `openspec_apply_worktree action=recover` before retargeting or landing
