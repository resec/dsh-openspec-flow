# Proposal

## Why

The packaging requirement says the tarball and its metadata sit directly under `dist/`, but the entrypoint has always written them inside `dist/<name>-<version>/`, and `docs/installing-bundles.md` documents that layout. Following the spec literally means looking in a directory that never receives a file.

## What Changes

- State the version directory in the requirement and in the clean-tree scenario.
- Keep the metadata fields, the dirty-tree rule and the content check unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `bundle-packaging`: the packaging requirement names `dist/<name>-<version>/` instead of a flat `dist/` pair.

## Impact

- `openspec/specs/bundle-packaging/spec.md`: through the delta.
- No code change: `lib/bundle.js` already writes the nested layout, and `docs/installing-bundles.md` already documents it.
