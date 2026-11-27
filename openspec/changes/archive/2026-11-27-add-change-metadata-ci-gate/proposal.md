# Add a change-metadata gate to the OpenSpec check

## Why

A pull request can pass CI with an unloadable `openspec/changes/<name>/.openspec.yaml`. `openspec validate --all --strict` reads change metadata leniently: a YAML parse error is ignored unless the change declares `skip_specs`, so validation reports the change as valid. The strict loader runs only in `openspec status` and the commands built on it, and CI never executes one. The first failure then appears in the pull-request review watch, before the review can start.

PR #30 is the regression: a head passed CI while `openspec status --change fix-coverage-report-baseline --json` exited with `Invalid YAML in metadata file`, because `goal` had a multi-line plain scalar cut by the ` #10` comment. The test embeds those bytes; it does not read the live pull request, whose head can move.

## What Changes

- Add `scripts/check-change-metadata.mjs`. For every active change under `openspec/changes/`, excluding `archive`, it runs `openspec status --change <name> --json` with the bundled CLI and fails closed when the CLI cannot run, exits nonzero, reports an error status, or returns no readable projection.
- Append the script to `npm run openspec:check`, so pull-request CI and the non-main pre-push hook run it before a review starts.
- Add `test/check-change-metadata.test.mjs`. It embeds the malformed `.openspec.yaml` bytes from PR #30 (`goal` with the ` #10` continuation), so the regression does not depend on the live head, and covers the real-CLI success and failure cases plus the fake-CLI failure shapes and the order in which changes are checked.
- Update the `openspec:check` assertion in `test/hooks.test.mjs` and note the metadata load in `AGENTS.md`.

## Capabilities

### Modified Capabilities

- `contributor-workflow`: the OpenSpec check also rejects a change whose metadata cannot be loaded.

## Impact

- New: `scripts/check-change-metadata.mjs`, `test/check-change-metadata.test.mjs`.
- Changed: `package.json` (`openspec:check`), `test/hooks.test.mjs`, `AGENTS.md`.
- No change to `.github/workflows/ci.yml`: the existing verify job already runs `npm run openspec:check`.
- No change to the pinned OpenSpec CLI, the plugin runtime or any pull-request content.
