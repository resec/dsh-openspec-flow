# Proposal

## Why

`development-workflow` requires the `landCommit..archiveCommit` diff to touch only the archived change, its former directory and `openspec/specs/`. `scripts/push-landed.mjs` accepted any path under `openspec/changes/archive/`, so an archive commit that also rewrote another archived change passed the check and reached `origin/main` unreviewed. `docs/land-push.md` described that wider check instead of the spec.

## What Changes

- Accept only `openspec/changes/archive/<date>-<change>/` for the landed manifest's own change, plus `openspec/specs/` and deletions under the change's former directory.
- Name the offending path when another archived change's directory is touched.
- Align the check description in `docs/land-push.md` with the narrowed rule.
- Cover both directions in `test/push-landed.test.mjs`: a normal archive (own directory and specs) passes, an archive that also edits another archived change is refused.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The `development-workflow` requirement already says "touch only the archived change, its former directory and `openspec/specs/`"; only the implementation and its description were wider, so this change sets `skip_specs: true`.

## Impact

- `scripts/push-landed.mjs`: the archive-path whitelist.
- `docs/land-push.md`: the check description.
- `test/push-landed.test.mjs`: one refusal case and one acceptance case.
- No manifest format, dependency, hook, coverage-baseline or `dist/` change.
