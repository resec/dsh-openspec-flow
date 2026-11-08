# Add an OpenSpec CLI upgrade guide

## Why

The plugin pins `@fission-ai/openspec` to one exact version and projects that CLI's JSON into 13 tools, but nothing describes how to move the pin: which payload fields the projections read, which tests fail when a field moves, and which documentation carries the version. An upgrade currently starts by editing `package.json` and ends with a failing test run, with no checklist that proves the projection still holds.

## What Changes

- Add `docs/upgrading-openspec-cli.md`, an operator guide for an upgrade:
  - decide whether the target release is safe (release notes, CHANGELOG, `engines.node`, the `version --json` envelope);
  - inventory every CLI coupling by file and line;
  - edit manifest, lockfile, version assertions, skills, README and docs in one ordered sequence;
  - run the contract check, unit tests, integration tests, coverage gate and a DSH smoke session;
  - publish a new plugin version and roll back a rejected upgrade.
- Add `scripts/check-cli-contract.mjs` and `scripts/cli-contract.json`, a development-only check that:
  - builds a fixed fixture project and records the JSON shape of both the pinned CLI and a candidate CLI for every command the plugin runs;
  - diffs the shapes and reports added, removed and type-changed paths;
  - fails when a field listed in `scripts/cli-contract.json` is missing or has a different type in the candidate.
- Add `test/cli-contract.test.mjs` for the script's pure functions: shape extraction, diff, consumed-field checks and argument validation.
- Add `npm run contract:check` and link the guide from `README.md`.

Not included: no change to `lib/`, `index.js`, `skills/`, the packaged tool output, or the pinned dependency version; no automatic CLI upgrade.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `development-workflow`: add requirements for a documented upgrade procedure and for a contract check that fails on projection-breaking CLI differences.

## Impact

- New: `docs/upgrading-openspec-cli.md`, `scripts/check-cli-contract.mjs`, `scripts/cli-contract.json`, `test/cli-contract.test.mjs`.
- Edited: `package.json` (one script entry), `README.md` (one link), `openspec/specs/development-workflow/spec.md` after archive.
- Unchanged: runtime code, tool schemas, packaged skills and the `@fission-ai/openspec` pin.
