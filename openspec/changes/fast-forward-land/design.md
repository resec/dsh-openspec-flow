# Fast-forward land design

## Context

See [proposal.md](proposal.md) for the motivation. The current land path reads `mainHead`, verifies it is an ancestor of the feature head, takes the lifecycle and change locks, runs `git merge --no-ff`, records the merge commit, and calls `assertMergedTree`, which resets main to `mainHead` when the tree differs. The seal never takes the lifecycle lock, so another change can add a seal commit between the precheck and the merge.

The apply review records the reviewed tree. Land already refuses a feature head whose tree differs from that reviewed tree before taking the locks. The repository push script verifies the landed manifest and the archive commit.

## Goals / Non-Goals

**Goals**

- Land advances main with `git merge --ff-only`; a successful land adds no merge commit.
- A main that moves after the precheck fails before or during the fast-forward, never through a reset that discards the concurrent commit.
- A partly completed land is recoverable without a second fast-forward or archive.
- New manifests identify `landCommit`; old manifests that only carry `mergeCommit` keep working for cleanup and push. `remove` reads apply state only and never reads a landed manifest.
- Push-landed verifies the same facts for both manifest shapes.

**Non-Goals**

- The seal does not acquire the lifecycle lock. The recheck plus `--ff-only` is the race boundary.
- Existing merge commits on main are not rewritten.
- Land does not push, create a pull request or change the GitHub ruleset.
- No configuration switch restores `--no-ff`; there is one land path.
- A non-linear feature is not automatically rebased or rewritten by land.

## Decisions

### Fast-forward with a two-sided tree check

Land verifies `featureHead^{tree} === required.tree` before touching main, then runs `git merge --ff-only <branch>`, then verifies `HEAD^{tree} === required.tree`. The feature-side check makes an unexpected resulting tree impossible in normal operation; the main-side check is a final assertion. Neither check resets main.

Alternative considered: keep `--no-ff` and only tighten the tree check. Rejected because it preserves the merge commit that violates the linear-history rule.

Alternative considered: use `git merge --ff-only` and delete `assertMergedTree`. Rejected because the exported helper still carries the old reset behavior and tests depend on the guard. Replace it with a read-only tree assertion.

### Linear feature history is a precondition

Land rejects a feature whose `mainHead..featureHead` range contains a merge commit (`git rev-list --merges`). A developer who merged main into the feature branch must rebase onto main first. This keeps the fast-forward from importing merge commits into main. The check does not write a rebase marker because the marker means "rebase, retest and re-review the tree"; a linearity-only rebase may keep the same tree and the same ready review. If the rebase changes the tree, the existing apply-review readiness check refuses until a new round is ready.

### Recheck under the locks, then let the fast-forward fail safely

The precheck stays before the lock handover so a behind-main worktree gets the existing rebase marker without taking the lifecycle lock. After acquiring the lifecycle lock and the fresh change lock and writing `status: landing`, land re-reads main:

- If main differs from the precheck head, land writes the rebase marker with the new main, restores `active`, and refuses.
- If main is unchanged, land attempts `git merge --ff-only`.
- If a seal commits after the recheck, the fast-forward refuses because main is no longer an ancestor of the feature head. The catch path checks whether main moved, writes the rebase marker when apply review is enabled, and restores `active`.

The catch path must not call `reset`, `checkout --hard` or any command that rewinds main. The concurrent commit stays reachable. This is the deliberate behavior change from `assertMergedTree`.

A failed land before the fast-forward restores `status: active`. When the failure happens after the fresh change lock is held, the catch path records that lock's token/pid on the active state and keeps the lock for the next attempt, preserving the existing handover requirement. A failure during lock acquisition has no fresh lock to keep, so it restores the state without a token and the next apply acquires the free lock.

Alternative considered: make seal take the lifecycle lock. Rejected by the requested scope. It would remove the narrow post-recheck window but serialize seal with land.

Alternative considered: retry the fast-forward automatically after a seal. Rejected because the feature must be rebased and retested; an automatic retry would either fail or land an unreviewed tree.

### Recovery recognizes fast-forward and legacy pairs

`findMerge` is replaced by `findLanding`, which looks at the current `HEAD` and `HEAD~1`:

1. `HEAD` equals the feature head and carries the required tree: the fast-forward completed, archive pending.
2. `HEAD` is the archive commit whose parent equals the feature head: the archive commit completed, manifest or cleanup pending.
3. Legacy: `HEAD` is a merge whose second parent is the feature head and whose tree is required, or `HEAD~1` is such a merge and `HEAD` is its archive commit.

The legacy branches keep an in-flight state created before this change recoverable. A new land never creates a merge.

`mainHead` comes from `landCommit^1` for both shapes: for a fast-forward it is the old main; for a legacy merge it is the first parent. The retry reuses `findLanding` and never runs `git merge` when a landing commit already exists.

### New manifest field and legacy fallback

New manifests use `<landCommit>.json` and record `landCommit`, `landMode` and no `mergeCommit`; a new land writes `landMode: "fast-forward"`, while a retry that completes an in-flight legacy merge writes `landMode: "legacy-merge"`. The cleanup reader resolves `manifest.landCommit ?? manifest.mergeCommit`; `push-landed` has its own resolver and `remove` reads no manifest. The tool result carries both `landCommit` and a deprecated `mergeCommit` alias with the same value so existing callers keep working during the transition.

Alternative considered: keep writing `mergeCommit` as an alias in new manifests. Rejected because it would perpetuate the merge terminology and require two sources of truth. The repository push script is updated in the same change; external users of an older script must upgrade.

### Push-landed accepts both selectors and both manifest shapes

`--land` selects by land commit prefix; `--merge` remains as an alias for legacy commands. Validation resolves `landCommit ?? mergeCommit`, rejects a manifest that carries both with different values, checks the resolved commit's tree and ancestry, and reports the commit as `land`. The rest of the remote and pre-push logic is unchanged.

### Policy, skills and review documentation

Land is described in the registered flow rule, the shipped apply and archive skills, and `docs/review.md`, not only in the two land pages. The change updates all of them in the same round as the code so an agent is not told that land merges while the specs say it fast-forwards. The `change-review` delta also moves its land tree-binding requirements from the `--no-ff` merged tree to the feature tree and the resulting main tree, so archive does not leave a contradictory main requirement. The policy test asserts the fast-forward wording, and the documentation tests assert the new documented tokens rather than only the old command names.

Modified requirement blocks keep their existing scenario identifiers. OpenSpec's delta validator treats a renamed scenario as a dropped scenario, so renaming "The merged tree differs", "Archive fails after the merge" or "Merge tree does not match the review" would require duplicating the old scenario or moving unrelated requirements. The scenario bodies and requirement descriptions state the fast-forward behavior; untouched merge wording in unrelated main requirements is outside this change until those requirements themselves change.

### State compatibility

The apply state schema does not change. `status: archived` with a manifest and incomplete cleanup still retries only cleanup; the cleanup result reports `landCommit` and the alias. An archived state with a completed cleanup and a pending rebase marker still retries the marker clear and cleanup as before.

## Risks / Trade-offs

- **A seal after the recheck still fails the land** → This is intended. The rebase, retest and re-review path stays, and no commit is lost because main is never reset.
- **Test fixtures and documentation are saturated with merge terminology** → Update land and push tests together; add explicit legacy-manifest tests so the fallback is not theoretical.
- **Recovery detection only covers `HEAD` and `HEAD~1`** → Land is serialized by the lifecycle lock, so no other land commit can appear between the fast-forward and the archive. A later unrelated main commit is a manual recovery case, as it already is for the merge path. A seal commit that arrives between the fast-forward and the archive is the same manual case because the seal does not take the lifecycle lock; push-landed refuses a manifest whose archive commit is not the selected land plus archive pair.
- **The push-side tree check is weaker for a fast-forward manifest** → The land commit is the reviewed feature head, so the reviewed-tree guarantee rests on land's pre-fast-forward check. Push still verifies the manifest tree, ancestry and archive diff; land's tests cover the pre-check separately.
- **Manifest readers see two field names** → New code reads one resolved value; the alias exists only for compatibility and is documented as deprecated.
- **Existing main merge commits remain** → The change stops new ones but does not rewrite history. A full-history policy would need a separate decision.
- **A feature with a merge commit cannot land until rebased** → Document the correction in `docs/apply-worktree.md` and the push page.

## Migration Plan

1. Update manifest readers and `push-landed` first so they accept both `landCommit` and `mergeCommit`.
2. Switch land to fast-forward and update the tool result and docs.
3. Run the full test suite and coverage gate on Node 24.
4. No data migration or manifest rewrite. Existing manifests stay in place; new land writes the new shape.
5. Rollback is a source revert of the land change. Already-landed manifests remain readable by the reverted code only if the reverted code understands `landCommit`; otherwise a manifest written by this change must not be re-read by the old code. That is why the reader fallback and the push update ship in the same change.

## Open Questions

None. The seal lock scope, legacy alias and no-reset behavior are decided.
