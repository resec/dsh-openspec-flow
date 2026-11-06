# Design

## Context

See proposal.md for the motivation. The plugin repository kept three kinds of eval references after `eval/` moved to `dsh-openspec-flow-eval`: README text that names deleted npm scripts, a `development-workflow` requirement that repeats those script names, and coverage-gate tests that build eval-scope fixtures. The coverage gate now defines a single `plugin` scope in `scripts/coverage-gate.mjs`, so those fixtures no longer exercise a real scope.

## Goals / Non-Goals

- Goal: every eval reference in docs, the verification spec and the coverage-gate tests is removed or rewritten for the plugin-only repository.
- Non-goal: change runtime code, package scripts, the coverage gate implementation, or the evaluation-harness contract that lives in the other repository.

## Decisions

- **Change the requirement, not only the README.** The verification contract is the `development-workflow` spec, so the spec must stop naming `test:eval`/`test:all`; otherwise the next README edit can drift back to a command the repository cannot run. Alternative rejected: keep the spec and add a note that eval changes belong elsewhere — the spec describes this repository, which has no eval scope.
- **Replace the coverage-gate scope requirement instead of editing its name.** "Separate plugin and eval scopes" names the removed behavior, and a MODIFIED block must keep the existing header. The delta therefore REMOVES that requirement and ADDs "Plugin coverage scope"; the removed requirement carries the reason and the migration pointer. The capability Purpose is edited in the main spec because a delta cannot carry a Purpose for an existing capability.
- **Delete eval fixtures in tests instead of renaming them.** `writeBaseline`, `runGate` and the report-mode test receive eval-scope data that the gate ignores. Keeping that data under a new name would preserve dead coverage and hide that the gate has one scope. Generic helper assertions that only need a scope label move to `plugin`.
- **Do not add an eval-scope alias to the gate.** The harness owns eval coverage in its own repository; this gate stays plugin-only.

## Risks / Trade-offs

- [A test that only passed because the gate ignored eval input could now fail] → the fixtures are removed rather than made load-bearing, so the assertions that remain cover only plugin behavior the gate already enforces; the full suite and `coverage:check` verify the result.
- [Future harness work reintroduces an eval scope here] → the README pointer to `dsh-openspec-flow-eval` stays, and the spec names only commands this repository ships.

## Migration Plan

1. Update README and the delta spec.
2. Remove eval-scope test fixtures.
3. Run `npm test`, `npm run coverage:check` and `openspec validate remove-eval-residue --strict`.
4. Rollback: revert the three files; no data or API migration is involved.
