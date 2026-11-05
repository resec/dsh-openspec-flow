# Bundle a pinned OpenSpec CLI

## Why

The plugin's JSON projections and schema gate are built against OpenSpec CLI 1.16.0, but the executable is still resolved from `cliPath`, `PATH`, or the nearest `node_modules/.bin/openspec`. Any of those can supply a different CLI version, so the plugin can run against a binary whose payload fields, schema resolution, or file behavior it was not built for. The schema gate added earlier only constrains the schema name; it does not constrain the CLI itself.

Bundling the CLI as a runtime dependency makes the version part of the plugin installation. Removing the override paths makes that version the only executable the plugin can use.

## What Changes

- Move `@fission-ai/openspec` from `devDependencies` to `dependencies` at the exact version `1.16.0`.
- Remove the `cliPath` configuration field; reject a legacy `cliPath` value instead of silently ignoring it.
- Resolve the CLI from the plugin installation tree and execute it with the Host's Node executable.
- Remove `PATH` and project-local `node_modules/.bin/openspec` lookup.
- Verify `openspec version --json` once per process: `version` must equal the pinned version and `schemaVersion` must equal `1`. Fail before running any command on a mismatch.
- Update the test harness, README, `AGENTS.md`, bundle comments, and regression tests.

## Capabilities

### New Capabilities

- `cli-bundling`: defines the single executable source, the pinned version check, and the failure modes for an incomplete or mismatched installation.

### Modified Capabilities

None.

## Impact

- Affected code: `package.json`, `package-lock.json`, `index.js`, `lib/openspec.js`, `test/fake-context.mjs`, `test/integration.test.mjs`, new CLI/config tests.
- Documentation: `README.md`, `AGENTS.md`, `cordis.patch.yml`.
- Runtime shape: the plugin now depends on the OpenSpec package at install time; a linked local install must run `npm install` in the plugin directory.
- No tool output shape changes for a correctly installed 1.16.0 CLI.
