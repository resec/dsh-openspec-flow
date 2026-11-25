# Proposal: Guard the archive commit scope

## Why

The land flow tolerates other changes' uncommitted planning files, but `git commit` commits the whole index. A staged path outside the archive scope can therefore enter the archive commit. In this repository the landed-push guard refuses an archive diff outside `openspec/changes/archive/` and `openspec/specs`, leaving an archived change with an unpushable land; a project without that guard would publish the foreign path. The land-side guard refuses before the archive commit exists. The recovery path that accepts an archive commit already on main has the same gap.

## What Changes

- Require an empty git index before land updates main and again before the archive commit is created. A non-empty index refuses and names the staged paths; land never resets them.
- After staging, verify that the staged set is not empty and that every staged path lies under the archived change's directory, `openspec/specs`, or the removed source change directory. A path outside those prefixes refuses without committing.
- Resolve exactly one archived directory on the resume path that stages an interrupted archive commit, and refuse a missing or ambiguous directory.
- Verify an archive commit already on main when a resumed land accepts it: identify its archived directory from the commit's added paths and require every other path to lie under the removed source change directory or `openspec/specs`, so a manually created commit cannot bypass the same scope.
- Adjust the failed-land resumability statement: after a failed archive commit the operator unstages the interrupted staging with a mixed `git reset`, then a retry completes the commit without fast-forwarding or archiving twice.
- Document the recoveries for a staged index, a missing or ambiguous archived directory, and a refused resumed commit.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `apply-worktree`: land gains an empty-index precondition, the archive commit stages and verifies only the archive scope, a resumed archive commit is verified against the same scope, and the failed-land retry states the unstage step.

## Impact

- `lib/worktree/land.js`: the land precondition, the shared archived-directory resolution, `commitArchive`, and `findLanding`; one pure helper is exported for its unit test.
- `test/worktree-land.test.mjs` and a unit test for the scope classifier.
- `docs/apply-worktree.md` and `docs/land-push.md`.
- No state schema, manifest format, commit message, or tool schema change.
- The installed plugin copy is frozen; the fix runs only after a repack and reinstall.
