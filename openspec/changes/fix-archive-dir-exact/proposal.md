# Proposal

## Why

`archiveLanding` decides whether the merged change was archived by looking for an archive directory name that ends with `-<change>`. Archiving stores a change as `<date>-<change>`, so a different change whose name ends with the landed one (`extra-widget` when landing `widget`) also ends with `-widget`, and its archived directory is accepted as proof that `widget` is archived. The landing then records an archive commit that does not exist for this change, `push` records the wrong head and `finish` writes a manifest for work nobody archived.

## What Changes

- Compare the archive directory name with the change name after removing the date prefix, so only the directory that holds this change counts as archived.
- Treat a missing archive directory as not archived, so the landing fails with the existing "has no archive directory" refusal instead of a `readdir` error.
- Cover the matching: a longer name (`<change>-extra`), a name that ends with the change, an undated name and the exact directory together; a missing archive directory; and that the exact directory still records the archive commit.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. "Archive on main after merge" in `pr-review-pipeline` already requires the `archive` command to record the archive commit of the landed change; the suffix match was an implementation defect, so this change sets `skip_specs: true`.

## Impact

- `scripts/pr-review-land.mjs`: the archive-directory match in `archiveLanding`, plus the date-prefix helper it uses.
- `test/pr-review-land.test.mjs`: a `mergedLanding` fixture helper and two new tests.
- No change to the landing phases, the archive command, the manifest, or `lib/worktree/land.js`, which has its own archive retry path outside this issue; no dependency, workflow, hook, coverage-baseline or `dist/` change.
