# Proposal: Let `bundle:pack` ignore OpenSpec dirt

## Why

Several changes can be in flight at once, so `openspec/` routinely holds uncommitted planning artifacts on `main`. Those paths cannot reach the tarball — the manifest's published file list excludes them and the content check rejects any `openspec/` path — yet `npm run bundle:pack` refuses the whole pack because the working tree is not clean. A maintainer therefore cannot produce an artifact while a parallel change is being drafted or applied, even though the packed bytes are unaffected.

## What Changes

- The dirty-tree gate ignores uncommitted paths under `openspec/` and refuses only on the remaining dirt, because the packed bytes cannot include them.
- The refusal names the blocking paths, and reports the ignored `openspec/` paths as ignored instead of blocking.
- The gate reads status paths the rename-safe way the review store already uses, so a rename that moves a published file under `openspec/` still blocks.
- `README.md` (the install text that ships inside the tarball), `docs/installing-bundles.md` and `AGENTS.md` state that the published content must be committed, instead of requiring the whole tree to be clean; the `--help` line states the same rule.
- `README.md`'s file layout and the proposal's impact list gain the shared status-path module the parser moves into.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `bundle-packaging`: the dirty-tree requirement narrows from "the working tree must be clean" to "no uncommitted change outside `openspec/`", with the ignored set, its reporting and an unchanged `dirty` flag named.

## Impact

- `lib/pack.js`, `lib/bundle.js`, `lib/status-paths.js` (new), `lib/review/store.js` (shared status-path parsing), `test/pack.test.mjs`, `test/bundle.test.mjs`.
- `README.md`, `docs/installing-bundles.md` and the `AGENTS.md` packaging paragraph.
- No change to the tarball's file set, the metadata fields, the content check or the install procedure. The separate porcelain parser in `scripts/affected-tests.mjs` stays as it is; see design.md.
