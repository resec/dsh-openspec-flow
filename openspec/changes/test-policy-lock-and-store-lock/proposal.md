# Proposal

## Why

`test('new change locks a policy and ignores later settings')` locked the policy with the draft review disabled and then never changed a setting, so its title claimed a behavior the test did not exercise. The policy lock and its reviewer model were therefore only checked against the settings that created it.

The store-domain apply lock had unit tests in `test/review-lock.test.mjs` but no tool-level test. Nothing proved that `openspec_review` writes the store lock at the documented location, that a refusal rolls back only the lock the caller created, or that `openspec_archive` refuses a store change from another project, though `tool-surface:729-731` and `change-review:959-962` require it.

## What Changes

- Rework the policy-lock test: create the change with draft and apply review enabled, then apply new settings (`reviews.apply.enabled=false`, another reviewer count and reviewer model) and assert the locked `policy.json` and reviewer model are byte-identical, the draft review still runs in its locked self mode, and a change created after the edit locks the new values.
- Add a spec-shaped todo test: a locked apply policy still gates `openspec_archive` after the settings disable it. It fails on the current implementation because the archive gate reads the current settings; it stays a todo until issue #45 settles the direction.
- Add a tool-level store-lock test: a store-backed change starts its apply review through `openspec_review`, takes the implementation and store locks at the documented paths, a second project is refused by the store lock and releases only its own lock, that project's archive is refused, and the owning project's archive releases its own locks.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. `change-review:8-27` already requires the policy to be immutable once written, `change-review:958-962` requires the store lock, and `tool-surface:729-731` requires the archive refusal, so this change sets `skip_specs: true` and adds tests only.

## Impact

- `test/review-apply.test.mjs`: the policy-lock test gains a real settings edit, plus one todo case for the gate.
- `test/review-serial.test.mjs`: a store fixture helper and the tool-level store-lock test.
- No implementation, dependency, hook, workflow, coverage-baseline or `dist/` change.
