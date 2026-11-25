# Design: Guard the archive commit scope

## Context

`commitArchive` stages three paths but `git commit` commits the whole index. Land already tolerates other changes' uncommitted planning files, so a staged path under another change's directory survives the dirty-tree filter and can enter the archive commit; `git add -A -- openspec/specs` also folds any pre-existing staged spec change into the same commit. The only guard today is that the staged set is non-empty. In this repository the landed-push guard refuses an archive diff outside `openspec/changes/archive/` and `openspec/specs`, so the visible failure is an archived change with an unpushable land; a project without that guard publishes the foreign path. The recovery path that accepts an archive commit already on main verifies neither the index nor the commit's paths, so a manual commit bypasses the same invariant. See `proposal.md` for the motivation.

## Goals / Non-Goals

**Goals**

- Make the archive commit contain only the archived change directory, `openspec/specs`, and the removed source change directory.
- Refuse before main moves when the index is not empty; refuse again inside the archive commit when the staged set is out of scope.
- Verify an archive commit already on main when a resumed land accepts it.
- Refuse without resetting, checking out, or cleaning the operator's index.
- Add focused regression tests and update the land documentation.

**Non-Goals**

- No change to the dirty-tree tolerance for untracked or unstaged planning files.
- No automatic `git reset` or any index rewrite by the plugin.
- No staging restricted to individual delta capability paths; `openspec/specs` remains one allowed prefix.
- No change to the landing state schema, manifest format, archive commit message, or tool schema.

## Decisions

### Empty index at two points

Land SHALL refuse when the index carries any staged path, both before the fast-forward and again before the archive commit stages anything. The pre-fast-forward check fails while the state is still `active` and main is untouched; the commit-time check covers a resumed land and any concurrent writer between the checks. A non-empty index refuses with the staged paths listed and tells the operator to commit or unstage; it never resets the index, because staged content may belong to another session.

Alternative considered: accept staged paths that already lie inside the allowed scope, so an interrupted staging can resume. Rejected: `git add -A -- openspec/specs` cannot distinguish another session's staged spec edit from an interrupted archive staging, and the invariant becomes conditional. The recovery is explicit: `git reset` (mixed, which leaves the working tree alone) then retry land; `findLanding` resumes the interrupted landing without a second fast-forward.

### Post-staging scope verification

After staging and before committing, land lists the staged paths with `git diff --cached --name-only --no-renames -z`, normalizes separators to POSIX, and requires a non-empty list whose every path is either equal to one of the three allowed prefixes or under `<prefix>/`. `--no-renames` lists both sides of a rename so a source path cannot hide behind a detected rename; `-z` keeps unusual paths unambiguous and the output is read without `trim`. The three prefixes are made relative to the main worktree and refuse an empty, absolute or `..`-escaping path.

Alternative considered: use `--name-status` to parse renames. Rejected as unnecessary once `--no-renames` is used.

### Verify a resumed archive commit

`findLanding` SHALL verify an already-recorded archive commit before accepting it: identify from the commit's added paths one archived directory named `<date>-<change>` (or the change name when it already carries a date prefix), list the commit's changed paths with `--no-renames -z`, and require every path to lie under that directory, `openspec/specs`, or the removed source change directory. A commit with no such directory, more than one, or a path outside the scope refuses while the state stays `landing`. The name check rejects a single archived directory belonging to a different change. This applies to both detection forms: a one-parent archive commit on the land commit, and the legacy-merge parent form. Deriving the directory from the commit avoids a filesystem scan and closes the suffix-match ambiguity of the current resume lookup.

The resume path that stages an interrupted archive has no commit to derive the directory from. It SHALL resolve at most one directory under `openspec/changes/archive/` matching `<date>-<change>` or the change name when the change already carries a date prefix, and reuse that resolution in the retry path. Zero matches mean no interrupted archive is present, so the normal archive runs; more than one match refuses before staging while the state stays `landing`, and the diagnostic names the candidates and points at `git log` and `git status` so the operator can restore one intended directory.

Alternative considered: trust a commit that `findLanding` already associates with the landing. Rejected: a manual commit created through the documented recovery would bypass the same invariant, which is exactly the hole being closed.

### Scope versus the landed-push guard

The land guard allows the change's own archived directory; the landed-push guard allows any directory under `openspec/changes/archive/`. The land scope is deliberately narrower: the archive operation creates only its own directory, so accepting the broader prefix would let a foreign archived path pass the earlier check and rely on the push guard. The push guard stays a second layer for the maintainer flow and for histories created before this change; the difference is stated here rather than reconciled to parity. A future change may align the two if a legitimate flow needs to archive more than one directory in one land.

### Scope helper placement

The pure classifier (given staged paths and allowed prefixes, return the out-of-scope paths) lives in `lib/worktree/land.js` and is exported for its unit test, following the existing `manifestPath` export. A separate module was considered; it is not justified by one small pure function and would enlarge the bundle surface without a second consumer.

### Failure and recovery behavior

- Refusal before the fast-forward: state stays `active`, main is unchanged, the index is unchanged.
- Refusal after the fast-forward but before the commit: state stays `landing`; a retry runs `findLanding`, re-enters the archive phase, and never fast-forwards again.
- An interrupted staging leaves allowed paths in the index. The diagnostic names them and points at a mixed `git reset` (working tree untouched); after the reset a retry re-stages and commits.
- An ambiguous archived directory on the pre-staging resume path, or a commit with no single archived directory on the resumed-commit path, refuses while the state stays `landing`. Zero matches before staging mean the archive has not moved yet, so the normal archive runs. The pre-staging diagnostic names the candidates and the two inspection commands; the operator restores one intended directory (or recreates a single directory for the commit) and retries. A stray directory is removed only after verifying it is not the intended archive.
- An operator who already committed an archive commit manually reaches the resumed verification; a scope-compliant commit is accepted, an out-of-scope or directory-less commit refuses.

## Risks / Trade-offs

- A failed commit after a successful fast-forward leaves a `landing` state until the operator unstages and retries. Mitigation: the pre-fast-forward check catches the common case first; the diagnostic names the recovery, and the failed-land requirement now states the unstage step.
- `git add -A -- openspec/specs` still stages an unstaged spec edit created between the pre-fast-forward check and staging by an out-of-contract concurrent writer. Mitigation: the lifecycle lock serializes plugin operations and the pre-fast-forward dirty check refuses existing spec edits; a future change can restrict staging to the change's delta capabilities.
- A manual archive commit that adds the archived directory but omits some moved files passes the scope check. Mitigation: this is a recovery path only; the operator is instructed to recreate the archive with the CLI or restore the full directory, and the manifest still records the commit for inspection.
- An old manual archive commit with no added archived directory is now refused on resume. Mitigation: it was already outside the documented flow; the operator recreates the commit within scope after inspecting the archived directory.
- The installed plugin copy is frozen. Mitigation: repack with `--force` and reinstall after the change lands; the repository-side contributor flow is unaffected.

## Migration Plan

No data migration and no state-field change. After the change lands, run `npm run bundle:pack -- --force`, remove the installed bundle in the Plugins page, install the new tarball and restart the session. Rollback reinstalls the previous tarball. An in-flight `landing` state created before the upgrade is resumed by the new verification: a compliant archive commit proceeds; a failed commit requires the mixed `git reset` first; an out-of-scope or directory-less commit refuses until the operator fixes it.

## Open Questions

None.
