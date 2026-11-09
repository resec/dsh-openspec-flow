# Design: Strict artifact gate

## Context

See proposal.md - Why. The repository already runs one pre-push gate (`npm run coverage:check` via `.githooks/pre-push`), and the plugin ships the OpenSpec CLI as an exact dependency, so the checker needs no new code path or dependency. The CLI's change validation and spec validation are separate: `validate <change>` inspects deltas, while main specs are validated only by `--all` or by naming the spec. Archived changes cannot be validated as changes; `--archived` checks task completion only.

## Goals / Non-Goals

Goals:

- One command that reports every strict finding across active changes, main specs, and archived task state.
- A pre-push hook that blocks a warning before coverage runs.
- Repository instructions that make strict the default for agents working here.

Non-Goals:

- Changing `openspec_validate`'s default or the packaged skills.
- Re-validating archived delta bodies; the CLI has no supported entry point.
- CI enforcement; this repository stays local-hook only.
- Adding a general-purpose skip switch.

## Decisions

### Strict stays a repository policy, not a product default

The product keeps matching the CLI: `strict` remains opt-in, because archive and plain validation accept warnings and the plugin's own archive pre-check relies on that agreement. Making strict the product default would reject changes the CLI archives. The repository is stricter than its product, which is a local decision recorded in `AGENTS.md`.

### The gate calls the CLI directly

`openspec_validate` has no archived scope, and a Git hook runs outside an agent session. A package script over the bundled CLI is the smallest surface that covers both checks. `npm` puts `node_modules/.bin` on `PATH`, so `"openspec:check": "openspec validate --all --strict && openspec validate --archived --strict"` needs no resolver, no new module, and no coverage-scope code.

### Two commands define the covered set

`--all --strict` covers every active change and every main spec, where the warning-producing checks live. `--archived --strict` covers archived task completion. Archived delta bodies stay outside the gate: `validate <archived-name>` returns `unknown_item`, and `--archived` is documented as task completion only. The limitation is stated in the requirement and the README so nobody reads a green hook as full historical validation.

### Validation runs before coverage

Validation takes milliseconds and its failure is actionable on its own; running it first avoids spending the coverage run on a tree that a warning already rejects.

### No new skip variable

`COVERAGE_SKIP=1` keeps its meaning and skips only coverage. The whole hook is bypassed with `git push --no-verify`, which is visible in the command history. A dedicated validation skip variable would be used routinely and would silently restore the status quo.

### Hook wiring is tested, the checker is the CLI's job

The repository tests what it owns: the hook runs both commands in order, and `COVERAGE_SKIP` still reaches the validation step. The validation semantics belong to the pinned CLI, so the test asserts the wiring rather than re-implementing validation.

## Risks / Trade-offs

- [A CLI upgrade adds a warning and pushes start failing] → The upgrade checklist runs `npm run openspec:check` and treats new findings as part of the upgrade.
- [A change cannot be pushed before its warning is fixed] → Fix the warning first; the hook is meant to make that the path of least resistance.
- [`git push --no-verify` bypasses everything] → Documented as an emergency only; no quieter bypass exists.
- [The hook exists only after `npm run hooks:install`] → The installer remains the single setup step and its message names both gates.
- [Archived delta bodies are never re-validated] → Stated in the requirement, README, and the hook's own output.

## Migration Plan

1. Land the script, hook, and documentation in one change.
2. Run `npm run openspec:check` once on `main`; the current tree passes, so no artifact edits are needed.
3. Rollback: revert the commit; the previous hook runs coverage only.

## Open Questions

None.
