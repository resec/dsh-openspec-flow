# Proposal

## Why

The packaging requirement says the metadata records "whether the packed content differed from `HEAD`", but `metadataFor` wrote `dirty: false` unconditionally. The only gate was `git status --porcelain`, which does not list ignored files, so an ignored file under a `files` glob (`lib/debug.log` matches `lib/**`) entered the tarball while the metadata claimed the bytes were `HEAD`'s.

The required set had the mirror problem. `corePaths` and the `files` expansion walked the working directories, so an ignored or untracked file became a path the tarball had to carry. npm never packs `.DS_Store`, which left `skills/.DS_Store` or `lib/.DS_Store` rejecting every pack on macOS while `git status` was clean.

## What Changes

- Read the core set and the directory globs of `files` from the paths `git ls-files` lists instead of walking the directories. A missing published directory still fails the pack.
- Run `git ls-files -z` before packing and mark the metadata `dirty` when the tarball carries a path the repository does not track. The entrypoint lists those paths.
- The dirty-tree refusal, the `openspec/` exemption and `--force` are unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. `bundle-packaging` already requires the metadata to record whether the packed content differed from `HEAD`, and its content check already covers "every `lib/` file, every skill and the locale resources", which an ignored or untracked file is not. Only the implementation was incomplete, so this change sets `skip_specs: true`.

## Impact

- `lib/bundle.js`: `corePaths` and `expectedPublishedPaths` take the tracked paths; `untrackedPaths`, `metadataFor` and `publishVerified` carry the dirty flag.
- `lib/pack.js`: one more git call, the dirty computation and the report lines.
- `test/bundle.test.mjs`, `test/pack.test.mjs`: the new behaviour and the unchanged refusals.
- `docs/installing-bundles.md`, `AGENTS.md`: drop the claim that `dirty` is always false and name the source of the required set.
- No dependency, workflow, hook, coverage-baseline, `dist/` or `package-lock.json` change.
