# Upgrade the bundled OpenSpec CLI to 2.2.0

## Why

The plugin pins `@fission-ai/openspec` to one exact version and projects that version's JSON and text. The pin is still 2.0.0, so every fix released in 2.1.0, 2.1.1 and 2.2.0 remains unavailable: `validate --strict` warns about overlong MODIFIED requirements before archive, `archive` refuses before touching main specs when the archive folder already exists, retiring a capability reads wrapped lines starting with `<` correctly, and the CLI installs skills from its own package instead of cloning them. 2.2.0 is the current release; the changes after 2.0.0 do not move any field, command or instruction text the plugin consumes, so the pin can move without touching the projection.

## What Changes

- Move the exact `@fission-ai/openspec` pin from 2.0.0 to 2.2.0 and refresh `package-lock.json` with `npm install`.
- Bump the plugin to 0.10.0 so the five packaged skills' `metadata.generatedBy` name the release that ships them.
- Move every version literal with the pin: the version assertions in `test/openspec.test.mjs` and `test/skills.test.mjs`, the five `skills/*/SKILL.md` frontmatter blocks, the parser's two mirrored-version comments in `lib/tasks.js` (lines 5 and 36), `AGENTS.md`, `cordis.patch.yml`, both README tag tables and their version descriptions, and the maintainer guides.
- Record the verified compatibility facts in `design.md`: the JSON contract check reports no consumed field change, `version --json` still reports `schemaVersion: 1`, the target CLI declares `engines.node >=22.20.0` (below the plugin's `>=24.9.0`), `init --tools none --no-animation` still writes only the `openspec/` structure, and `instructions apply` returns the same instruction text and task shapes.
- Update the README CLI table's `init` row for the new `--scope` option and add the 2.2.0 router skill row to the skills table, marking it as not provided by the plugin.
- Re-measure the `instructions apply --json` byte count on the documented 39-task fixture with 2.2.0 and update the README verification sentence.
- The runtime code does not change: no tool parameter, output field, projection, task rule, schema gate or CLI invocation moves.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `project-invariants`: the OpenSpec CLI pin moves to 2.2.0; the schema envelope version stays 1.

## Impact

- `package.json`, `package-lock.json`: the pin, the plugin version 0.10.0 and its lockfile entry.
- `lib/tasks.js`: the parser's two mirrored-version comments (lines 5 and 36) move to 2.2.0.
- `test/openspec.test.mjs`, `test/skills.test.mjs`, `test/check-generated-skills.test.mjs`: version literals in assertions and fixtures.
- `skills/*/SKILL.md` (five files): `metadata.upstream` becomes `openspec@2.2.0`, `metadata.generatedBy` becomes `dsh-openspec-flow@0.10.0`.
- `README.md`: both tag-pinned tables, the version descriptions, the test-suite sentence, the limitations section, the CLI table's `init` row, the skills table's router row and the re-measured `instructions apply` figure.
- `AGENTS.md`, `cordis.patch.yml`, `docs/upgrading-openspec-cli.md` (baseline, coupling inventory and pin references, including the plugin version line) and `docs/upgrading-dsh-runtime.md` (its baseline block also names the CLI pin).
- The CLI's own dependency tree grows: 2.2.0 declares `skills@1.8.1`, whose `nostics`, `tar` and `tar` dependency tree enter `package-lock.json`, and `chalk` moves from 5.6.2 to 6.0.1 with a nested 5.6.2 kept under `ora`; `yaml` stays at 2.9.1. There is no new direct plugin dependency, runtime or Host service; the bundled CLI stays a single resolved copy and no command, parameter or option changes.
- Deferred to the release step: repacking the tarball under `dist/` and reinstalling the profile bundle, because the installed copy is frozen.
