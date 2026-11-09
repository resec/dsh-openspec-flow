# Proposal

## Why

This repository validates its OpenSpec artifacts without `--strict`, so warnings such as a scenario without a WHEN/THEN step, an overlong requirement, or a task file without checkboxes pass the completion gate. The CLI already treats them as findings and `openspec archive` accepts them, which lets a warning accumulate in the main specs until a later change cannot tell whether it added the problem. The development flow should use the stricter mode it already supports, and a local gate should stop a warning from being pushed.

## What Changes

- Add `npm run openspec:check`, which runs `openspec validate --all --strict` and `openspec validate --archived --strict` with the bundled CLI.
- Run `openspec:check` in the pre-push hook before the coverage gate; `COVERAGE_SKIP=1` continues to skip only coverage.
- State in `AGENTS.md` that this repository validates with `strict: true`, that a warning is a failure, and that a skill text which omits strict does not lower this gate.
- Document the new gate in `README.md` and in the CLI upgrade checklist, and update the hook installer message.
- Add a regression test for the hook wiring and for the checker's pass and fail paths.
- Do not change the product surface: `openspec_validate` keeps its CLI-matching default, and the packaged skills stay as they are.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `development-workflow`: the verification requirement now requires strict validation, and a new requirement covers the pre-push gate.

## Impact

- `package.json`, `.githooks/pre-push`, `scripts/install-hooks.mjs`, `AGENTS.md`, `README.md`, `docs/upgrading-openspec-cli.md`, `test/`.
- No runtime module changes, no new dependency, no tool schema change.
- Pushes from a tree that carries a strict warning are blocked until the warning is fixed; `git push --no-verify` remains the emergency escape.
