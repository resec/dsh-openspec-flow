# Upgrade the bundled OpenSpec CLI to 1.16.1

## Why

The plugin pins `@fission-ai/openspec` to one exact version, 1.16.0, and projects that CLI's JSON into every tool. Upstream 1.16.1 fixes delta parsing: section headings written with a closing `#` run are now read, and a requirement placed under an unrecognized `## ... Requirements` section now fails `validate` and blocks `archive` instead of passing with a warning and being dropped from the merged spec. Staying on 1.16.0 keeps users on the older behavior, where a misplaced requirement is silently lost at archive time, and leaves the version assertions, skill metadata and documentation naming 1.16.0.

## What Changes

- Move the exact `@fission-ai/openspec` pin from 1.16.0 to 1.16.1 and refresh `package-lock.json` with `npm install`.
- Update the pinned-version assertions in `test/openspec.test.mjs` and `test/skills.test.mjs`, and the `metadata.upstream` value in the five packaged skills.
- Bump the plugin version from 0.2.0 to 0.2.1, so every packaged skill's `metadata.generatedBy` names the release that carries this dependency.
- Add two regression tests against the real bundled CLI: a delta with a closed section heading validates and is listed by `show`; a delta with a requirement under `## DEPRECATED Requirements` fails validation and is refused by archive without moving files.
- Add a `tool-surface` requirement stating that `openspec_validate`, `openspec_show` and `openspec_archive` report the bundled CLI's delta-section parse, and remove the hardcoded `1.16.0` from the `skill-adaptation` instruction-mapping scenario.
- Update `README.md`, `AGENTS.md`, `cordis.patch.yml` and `docs/upgrading-openspec-cli.md` to the new pin.

Not included: no change to `lib/` runtime logic, tool schemas, output projections or the instruction-command map. The contract check reports no JSON shape change on any command, and `instructions` text is byte-identical between 1.16.0 and 1.16.1, so no projection or mapping update is required. The plugin version bump is a release label, not a behavior change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tool-surface`: add a requirement that validation, show and archive report the bundled CLI's delta-section parse, including closed headings and unrecognized requirement sections.
- `skill-adaptation`: the instruction-mapping scenario stops naming a specific CLI version.

## Impact

- Dependency: `@fission-ai/openspec` 1.16.0 → 1.16.1. `engines.node` is unchanged (`>=22.12.0` upstream, plugin stays at `>=24.9.0`); `version --json` still reports `schemaVersion: 1`.
- Runtime code: one comment in `lib/tasks.js` that names the mirrored CLI version; no logic change.
- Tests: two version assertions and two integration tests.
- Documentation: `README.md`, `AGENTS.md`, `cordis.patch.yml`, `docs/upgrading-openspec-cli.md`.
- Users: `openspec_validate` now reports an error, and `openspec_archive` now refuses, when a delta requirement sits under an unrecognized `## ... Requirements` section; closed `#` headings now parse as their unclosed form.
