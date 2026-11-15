# Proposal: package-bundle-install

## Why

The plugin is linked into the `web` profile, so the profile loads this working tree directly: HMR replaces the running plugin whenever a source file changes, although a review judges a committed state. Editing the plugin's own sources during a review therefore replaces the reviewer mid-round, and the running logic is whatever the working tree happens to hold.

A packaged install freezes the installed version. Source edits no longer change the running plugin or reload it, so a review keeps the installed logic and completes on it. New plugin logic takes effect only after the user installs a newly packed artifact.

## What Changes

- Add one packaging script that packs the current commit into an npm tarball under the repository `dist/` directory and writes a metadata file beside it: package name and version, file name, sha512, byte size, file count, `HEAD` revision, dirty flag and packed-at timestamp.
- Refuse to pack when the working tree is dirty, when the tarball misses a core runtime path or carries a test or OpenSpec path, or when an artifact pair for the version already exists without `--force`. `--force` republishes the same version, and installing it means removing the bundle in the Plugins page first, because the manager refuses a spec the profile already depends on.
- Installation stays manual: the user removes any installed bundle and then installs the tarball from `dist/` in the Plugins page. The script never calls the plugin manager and never writes the profile.
- The packaged form freezes the running plugin: source edits do not change the installed copy and do not reload it, so a review is not interrupted and needs no per-commit repack or reinstall. New plugin logic takes effect after the next install.
- `docs/review.md` states that the reviewer runs the installed artifact, that source edits leave it unchanged, and that new logic requires a reinstall.
- **BREAKING** Rewrite the README install section for the package form and raise the version to `0.4.0`, which also updates the five skills' `metadata.generatedBy`.
- **BREAKING** The linked install is no longer the supported install form for this repository.

## Capabilities

### New Capabilities

- `bundle-packaging`: the tarball artifact, its metadata, the packaging gates, the manual install entry point, and the frozen running copy that source edits cannot change.

### Modified Capabilities

- `review-documentation`: `docs/review.md` states that the reviewer runs the installed artifact and that source edits do not change it.

## Impact

- New files: `lib/bundle.js`, `scripts/bundle-pack.mjs`, `docs/installing-bundles.md`, `test/bundle.test.mjs`.
- Changed files: `package.json`, `package-lock.json`, `.gitignore`, `README.md`, `AGENTS.md`, `docs/review.md`, `docs/upgrading-openspec-cli.md`, the five skills' front matter.
- Changed tests: `test/bundle.test.mjs`, `test/skills.test.mjs`, `test/review-doc.test.mjs`.
- The installed bundle's own dependency `@fission-ai/openspec` now installs into the profile instead of the working tree.
