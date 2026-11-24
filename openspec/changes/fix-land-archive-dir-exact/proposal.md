# Proposal

## Why

`lib/worktree/land.js` decides on an archive retry whether a change was already archived by looking for an archive directory name that ends with `-<change>`. Archiving stores a change as `<date>-<change>`, so a different change whose name ends with the landed one (`extra-widget` when landing `widget`) also ends with `-widget`. Its archive directory is then accepted as proof that this change is archived: the retry commits that other directory or, when this change was never archived, skips the archive entirely and continues the land. The same defect was fixed for the landing script in #176.

## What Changes

- Compare an archive directory name with the change name after removing the archive date prefix, so only the directory that holds this change counts as archived.
- Cover the match: an archive directory named `<change>-extra`, a directory that ends with the change, and an undated directory are all refused, while the exact directory is committed; with only those foreign directories present, the retry refuses instead of claiming the change is archived.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. "A failed land keeps a resumable state" in `apply-worktree` already requires a retry to complete the archive commit of the landed change; the suffix match was an implementation defect, so this change sets `skip_specs: true`.

## Impact

- `lib/worktree/land.js`: the archive-directory match in the archive retry, plus the date-prefix helper it uses.
- `test/worktree-land.test.mjs`: a failed-archive fixture helper and two tests.
- No change to the archive command, the manifest, the landing script, or any dependency, workflow, hook, coverage-baseline or `dist/` file.
