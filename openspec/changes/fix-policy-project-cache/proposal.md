# Proposal

## Why

`lib/policy.js` cached the first project probe of every directory for the life of the process, both positive and negative. A session directory probed before `/opsx-admin init` stayed "not an OpenSpec project" after `openspec_init` created `openspec/`, so that session did not receive the flow rule until the process restarted. The same stale answer followed a switch to a branch that adds `openspec/` (#55).

The flow-policy spec already requires the plugin to evaluate project membership at each prompt assembly rather than only when the agent is created.

## What Changes

- Keep only positive probe results in `PROJECT_CACHE`. A negative result is probed again on the next assembly.
- Keep the comment in step with the behaviour: say what is cached and why negatives are not.
- Add tests for a directory that gains an `openspec/` root in the same process, through the rule section and through `openspec_init`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. `flow-policy` already requires project membership to be evaluated at each prompt assembly ("The rule follows the working directory"); the implementation kept a negative answer indefinitely, so this change sets `skip_specs: true`.

## Impact

- `lib/policy.js`: `isOpenSpecProject` and the `PROJECT_CACHE` declaration. `POLICY_TEXT` is not touched.
- `lib/review/settings.js`: `nearestOpenSpecProject` reads `isOpenSpecProject` and picks up the change without an edit.
- `test/policy.test.mjs`, `test/integration.test.mjs`: new assertions.
- No dependency, workflow, hook, coverage-baseline or `dist/` change.
