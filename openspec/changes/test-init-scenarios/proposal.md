# Proposal

## Why

The `skill-adaptation` spec names three init outcomes that the integration test never checks: the empty-project scenario requires `openspec/changes/` and `openspec/changes/archive/` and forbids `AGENTS.md`, and the existing-config scenario requires the config file to stay unchanged. The test asserted `root`, `config`, `openspec/config.yaml`, `openspec/specs/` and the absence of `.dsh/skills` only, so an init that skipped the change directories or rewrote a project config would still pass.

## What Changes

- Extend the `openspec_init` integration case to assert `openspec/changes/` and `openspec/changes/archive/` exist after the first call.
- Assert no `AGENTS.md` appears at the project root, which is what `--tools none` promises.
- Write a custom `openspec/config.yaml` between the two calls and assert the bytes are identical after the second call, so an existing config is never rewritten.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The spec already requires all three assertions, so this change sets `skip_specs: true`; only the test was incomplete.

## Impact

- `test/integration.test.mjs`: the `openspec_init` case gains the missing assertions.
- No `lib/` change, no dependency, workflow, hook, coverage-baseline or `dist/` change.
