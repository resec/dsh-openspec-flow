# Remove the eval residue left by the harness split

## Why

The real-model harness moved to `dsh-openspec-flow-eval` and this repository deleted `eval/`, but the docs and the verification spec still name `npm run test:eval` and `npm run test:all`, which no longer exist. `test/coverage-gate.test.mjs` also still builds eval-scope baselines and lcov fixtures for a gate whose only scope is `plugin`. A contributor who follows the docs runs missing scripts, and the spec demands commands the repository cannot execute.

## What Changes

- Rewrite the README verification section so it lists only `npm test`, and the coverage section so it says coverage runs the plugin suite once.
- Update the `development-workflow` Verification requirement: a finished change requires `npm test` and `npm run coverage:check`, with no eval-specific command.
- Replace the `coverage-gate` requirement that still describes separate plugin and eval scopes with a single plugin scope, and correct that capability's Purpose.
- Remove the eval-scope fixtures and parameters from `test/coverage-gate.test.mjs`; keep the generic assertions by naming the `plugin` scope.
- Leave runtime code, package scripts, the coverage gate implementation and every other capability unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `development-workflow`: the Verification requirement no longer names `npm run test:eval` or `npm run test:all`, because those scripts do not exist in this repository.
- `coverage-gate`: the requirement for separate plugin and eval scopes is removed and replaced by a plugin-only scope requirement, because the gate has one scope.

## Impact

- Changed: `README.md`, `openspec/specs/development-workflow/spec.md`, `openspec/specs/coverage-gate/spec.md` (Purpose), `test/coverage-gate.test.mjs`.
- Unchanged: `index.js`, `lib/`, `skills/`, `locale/`, `cordis.patch.yml`, `package.json` scripts, `scripts/coverage-gate.mjs`, and the shipped plugin bundle.
- Verification: `npm test`, `npm run coverage:check` and `openspec validate remove-eval-residue --strict` on Node 24. No model call is made.
