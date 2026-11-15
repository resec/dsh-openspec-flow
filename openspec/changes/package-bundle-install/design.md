# Design: package-bundle-install

## Context

See [proposal.md](proposal.md) - Why. The repository is the plugin source and also the profile's installed code, because the `web` profile declared a `link:<repo-checkout>` dependency. HMR replaces a linked plugin when its files change (`@deepseek-ai/dsh-hmr` README:49), so a source edit changes the running reviewer while a review judges a committed state. The profile has `patchReload: "live"`, so no restart bounds that replacement.

The plugin must stay plain ESM over Node built-ins; the packaging script is a development entrypoint, not runtime code, but it still runs on the repository's Node 24 baseline and must not need anything outside npm and Node.

## Goals / Non-Goals

Goals: one command produces a frozen install artifact for the current commit; the artifact's provenance is recorded; packaging refuses conditions that would make the record false; the installed copy keeps its logic while the sources change.

Non-Goals: installing automatically, changing the plugin manager, publishing to a registry, signing artifacts, changing HMR, or requiring a repack or reinstall for every apply commit.

## Decisions

### The artifact lives under the repository's ignored `dist/`

`dist/` is inside the repository, so packaging runs under the session's workspace-write sandbox without an escalation, and the artifact is backed up with the repository. It is added to `.gitignore` because the **metadata JSON** is otherwise an untracked file that dirties the tree: `*.tgz` already covers the tarball and `.cache/` already covers the npm cache, so the only new ignore entry needed is `dist/`. A dirty tree also makes the next pack refuse. Rejected alternatives: `~/.dsh/bundles/` needs a `danger-full-access` approval on every pack and loses the artifact when the repository moves; a global cache is not reproducible from the checkout.

The cost: `git clean -xfd` removes the artifacts, so `docs/installing-bundles.md` states they are regenerable and names the command.

### The script packs, records and verifies; installation is a user action

`plugin_manager` is a Host tool over the `pluginManager` service; `installBundle` has no CLI entry, and `dsh plugin` forwards arguments to pnpm (`dsh/src/plugin.ts:20`). The Web endpoint answers 401 without a connection. A standalone script therefore cannot drive the manager without writing the profile by hand, which the DSH documentation forbids. The script ends by naming the tarball and stating that the user installs it in the Plugins page.

Rejected alternatives: writing the profile manifest and patch from the script (bypasses bundle validation, rollback and HMR coordination); an SDK child session that calls the tool (heavy, needs a model route, races the running profile).

### `npm pack` produces the bytes in a scratch directory and the pair is published into `dist/`

`npm pack --pack-destination <temp>` applies the manifest's `files` field and npm's own ignore rules, so the tarball matches what a registry install would receive. The script packs into `.cache/pack/`, already covered by the ignored `.cache/`, reads and verifies the produced file, and only then renames the tarball and metadata into `dist/`; `dist/` is the published location, never npm's destination. The scratch directory is removed on both success and failure, so a rejected pack cannot leave an untracked directory that the dirty-tree gate would report next time. It also passes `--json --cache .cache/npm`. An interrupted publish therefore cannot leave a new tarball beside an old metadata file. Reimplementing tar creation would drift from npm's semantics.

Rejected alternatives: a hand-written tar writer (more code, same drift risk); `pnpm pack` (the pack semantics needed here are npm's, and the sibling `dsh-plugins` repository already uses `npm pack`).

### Metadata copies the sibling repository's shape

The metadata file uses `name`, `version`, `file`, `sha512`, `bytes`, `files`, `revision`, `dirty` and `at`, matching `dsh-plugins/issues/dist/*.json`, so a person reads one shape across both repositories. This repository adds no field: `revision` carries the commit and `dirty` records a non-clean tree, which the gate refuses, so a written record is always `dirty: false`.

### The gates refuse rather than warn

A dirty tree and a tarball that misses a published runtime file or carries a test or OpenSpec path exit nonzero. The dirty tree writes nothing because the pack never runs; the content check packs into a temporary destination and replaces the `dist/` pair only after it passes, so a rejected first pack and a rejected `--force` repack both leave `dist/` as the previous run found it. An existing artifact pair is refused unless `--force` is passed; `--force` republishes the same version, which is how a corrected artifact replaces an earlier one. The remedy the error message names is a version bump or `--force`.

### The packed content is derived from the manifest

The script gunzips the produced file and walks the tar headers with `node:zlib` only, then checks required and forbidden paths. The required set has an unconditional core: `package.json`, the manifest's `main` and `exports` targets, `cordis.patch.yml`, `icon.svg`, every file under `lib/`, every file under `skills/` and every `locale/*.json` file. The manifest's `files` list is then expanded on top of that core, so an entry that names a file is required and a glob adds the files it matches; the expansion can only add requirements. Deriving from `files` alone would let a manifest that drops `index.js` also drop the requirement that the tarball carry it, which is why the core is independent of the list it polices. A manifest that drops `lib/**` therefore fails the gate before the artifact is published. This reads the real artifact rather than the source tree, so a `files` list that says one thing while npm packs another fails the run. Rejected alternative: `tar -tzf` (an external process whose availability the gate would depend on).

### The installed copy is frozen, and that is the point

The profile runs the installed package under its own `node_modules`, not the working tree. Editing sources therefore cannot change the running plugin or trigger HMR, so a review keeps the installed logic and completes on it. The workflow deliberately does **not** require the installed artifact to match the reviewed commit, and does not repack per apply round: the reviewer runs the installed version, and a change to the plugin's own code is reviewed by that installed version rather than by itself.

New plugin logic takes effect only when the user installs a newly packed tarball, which the user does when the change is complete, when a new version is released, or when they need the new behavior. Reinstalling stops the plugin for the duration, so it belongs between review rounds rather than inside one.

Rejected alternative: requiring every apply commit to be installed before its review (adds a manual GUI step per round, and the reviewer would run code it is judging, which the user explicitly does not want).

### Version `0.4.0` and skill provenance

The install form change is breaking for anyone following the README, so the version moves to `0.4.0`. The five skills carry `metadata.generatedBy: dsh-openspec-flow@<version>`, and `test/skills.test.mjs` compares them against `package.json`, so the version bump necessarily updates all five in the same commit. The bump also refreshes `package-lock.json`, which records the version twice, and the plugin version line in `docs/upgrading-openspec-cli.md`; otherwise a later `npm install` rewrites the lockfile and dirties the tree that the pack gate requires clean, and the maintainer guide names a version that no longer exists.

## Risks / Trade-offs

- The installed reviewer can lag the reviewed code. Mitigation: this is the intended trade-off; the flow states the frozen version and that new logic needs an install, so a lag is visible rather than silent.
- Removing and reinstalling the bundle stops the plugin for the duration. Mitigation: installation happens between rounds, not inside one.
- The tarball installs `@fission-ai/openspec` into the profile instead of the working tree. Mitigation: the plugin resolves only its own installed copy (`lib/openspec.js`).
- `.gitignore` hides `dist/`, so a fresh clone has no artifact. Mitigation: the command is documented and the artifact derives from the commit.
- `git clean -xfd` deletes `dist/` and `.cache/npm`. Mitigation: both are regenerable and documented.
- A `--force` repack replaces the artifact without reinstalling. Mitigation: the docs state that a repack is followed by removing the bundle and installing the artifact when the change must take effect, and the installed copy keeps running until then.
- The manager refuses a spec the profile already depends on. Mitigation: every reinstall step names the removal first; the Plugins page reports `already-installed` otherwise, and the running copy keeps the previous bytes.

## Migration Plan

1. Implement the script, raise the version to `0.4.0`, refresh `package-lock.json` and the plugin version line in `docs/upgrading-openspec-cli.md`, and update the docs in one change.
2. Commit the implementation, so the pack runs on the clean tree its gate requires.
3. Run the pack command so `dist/dsh-openspec-flow-0.4.0.tgz` exists for that commit.
4. In the Plugins page, remove the linked bundle and install the tarball.
5. Verify the plugin row reports `0.4.0` and its package directory is inside the profile's `node_modules`, then verify a source edit no longer reloads the plugin.
6. To make later plugin logic run, repack and repeat the remove-then-install step; without an install the running copy keeps its version.
7. Rollback: remove the bundle and install the previous tarball again, or add the local directory again in the Plugins page. The profile is never edited by hand.

## Open Questions

None. The artifact directory, the manual install and the frozen-reviewer decision were confirmed before this change was created.
