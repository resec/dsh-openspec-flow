# Proposal

## Why

`lib/openspec.js` fails closed when the plugin's runtime dependency is incomplete: an unresolvable package, a package without a `bin.openspec` entry, a `bin` path whose file is gone, and a `version --json` call that prints no JSON each raise an error. Only the happy path and the version-mismatch branches have tests, so nothing stops a rewrite from dropping the recovery wording or the name of what is missing. The `cli-bundling` spec already requires the failure to tell the user to reinstall the plugin.

## What Changes

- Add four tests to `test/openspec.test.mjs`, one per failure path.
- Each test copies `lib/openspec.js` and `package.json` into a temporary installation tree, builds the broken state there (no `node_modules`, a manifest without `bin`, a `bin` with no file, a bin that prints prose), and asserts the message.
- Assertions require `Reinstall the plugin` on the three reinstall paths, name the missing package, the missing `bin.openspec` field and the missing bin path, and require the fourth message to carry the exit code and the CLI output.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. `cli-bundling` already requires an incomplete installation to fail with a recovery action; only the tests were missing, so this change sets `skip_specs: true`.

## Impact

- `test/openspec.test.mjs`: four new tests and two fixtures helpers.
- No `lib/`, spec, documentation, dependency, workflow, hook, coverage-baseline or `dist/` change.
