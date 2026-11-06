# Design: decouple the eval harness from the plugin repository layout

## Context

See `proposal.md` for motivation. Current constraints that shape the approach:

- `eval/lib/paths.mjs` derives `REPO_ROOT` from the module location and both the profile link and the fixture `git archive` use it directly.
- `eval/lib/fixtures.mjs` statically imports `../../lib/skills.js`, so the import itself assumes the parent directory is the plugin package.
- `eval/lib/verify.mjs` and `eval/lib/profile.mjs` use `OPENSPEC_BIN` from the plugin repository's `node_modules`.
- `prepareFixture` is synchronous; every caller and test depends on that.
- Tests must stay offline: no real model call, no network clone in `npm test`.

## Goals / Non-Goals

**Goals**

- One module that owns plugin discovery, validation and provenance.
- Default behavior in the current single-repository layout unchanged.
- Every run record identifies the measured plugin version and commit.
- A clone fallback that is explicit, testable without network, and never runs during a dry run.

**Non-Goals**

- No new repository is created here; the harness stays under `eval/`.
- No change to fixture content, arms, metrics or reporting shape beyond the plugin provenance block.
- No automatic plugin download during `npm test` or a dry run.

## Decisions

### `eval/lib/plugin.mjs` owns the plugin source

The new module is the only place that knows how to find, validate, clone and describe the plugin. It exports a resolver, a clone helper, a descriptor and a commit check. Other modules receive a resolved root or descriptor as an argument; they never derive it from their own location.

Alternative considered: keep `REPO_ROOT` and add overrides in each consumer. Rejected because the knowledge would be duplicated across five modules and the split would still require edits in each place.

### Resolution precedence

`--plugin-root` → `EVAL_PLUGIN_ROOT` → sibling `../dsh-openspec-flow` → current repository root. The sibling check comes before the current root so a future `dsh-openspec-flow-eval` checkout finds the plugin next to it; in the current layout both resolve to the same directory, so behavior is unchanged.

Validation is package-name based: the root must contain a `package.json` whose `name` is `dsh-openspec-flow`. An explicitly selected root (`--plugin-root` or `EVAL_PLUGIN_ROOT`) stops the harness before any model call when invalid; automatic candidates that are absent or invalid are skipped so a valid sibling or repository root can still win.

### Clone is an explicit execute-time fallback

`--clone` clones `git@github.com:resec/dsh-openspec-flow.git` into `eval/.plugin/` and checks out `--plugin-ref` (default `main`). A full clone is used, not a shallow one, because real fixtures need `git archive` on historical commits. An existing clone is fetched and checked out instead of cloned again.

A dry run never clones: if no local root resolves, it prints the clone command it would run and exits non-zero. This keeps `npm run eval:dry` free of network and filesystem side effects beyond the plan output.

### The CLI comes from the harness dependency tree

`createRequire(import.meta.url)` resolves `@fission-ai/openspec`, and the CLI path is derived from the resolved package root (`bin/openspec.js`). In the current layout this walks up to the repository `node_modules`; after the split it will find the eval repository's own dependency. Resolution is lazy so help, list and dry-run paths work without an installed CLI, and a missing CLI reports the install hint instead of crashing at import time.

### `installSkills` loads from the resolved root

`prepareFixture` stays synchronous. It loads the plugin's skill installer with `createRequire(pathToFileURL(join(pluginRoot, 'package.json')))` and `require('./lib/skills.js')`, which Node 24 supports for an ESM module without top-level await. This keeps the existing synchronous call graph and the single source of truth for skill text.

Alternative considered: make `prepareFixture` async and use `import()`. Rejected because it would ripple through the matrix loop and most fixture tests for no behavioral gain. Alternative considered: copy the installer into `eval/`. Rejected because the skill text and version stamping would drift.

The fixture `git archive` runs with `pluginRoot` as its cwd, and the fixture `node_modules` source defaults to the harness's own dependency root. Before archiving, the harness checks `git cat-file -e <base>^{commit}` and fails with the fixture id and commit when the base is missing.

### Provenance is data, not a log line

`describePlugin(root)` returns `{ root, version, commit, dirty }`. `commit` and `dirty` are `null` when the root is not a git checkout; a dirty checkout is still measured but marked. `matrix.mjs` writes the descriptor into each run record, and the report shows it next to the fixture commit.

### Tests inject git

`eval/test/eval-plugin.test.mjs` covers precedence, package-name validation, descriptor fields, base-commit failure and the clone helper with an injected `spawnSync`. No test performs network access or writes to the real `~/.dsh`.

## Risks / Trade-offs

- `require()` of ESM depends on Node 24 and no top-level await in `lib/skills.js` → covered by a fixture test; if the plugin gains top-level await, the loader switches to an async path.
- Sibling detection could pick an unintended checkout on a machine with several clones → `--plugin-root` overrides it and the chosen root is recorded in every run.
- A dirty checkout makes a run hard to reproduce → the record and report mark it explicitly.
- Clone needs network and GitHub credentials → only an explicit `--clone`, never in tests or dry runs.
- A rewritten fixture base commit breaks preparation → the commit check fails loudly before any model call.

## Migration Plan

No data migration. Existing `run.json` files without the plugin block remain readable. The single-repository default keeps current commands working; rollback is a revert of the change.

## Open Questions

None.
