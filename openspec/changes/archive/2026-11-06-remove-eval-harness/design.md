# Design: remove the evaluation harness

## Context

See `proposal.md` for motivation. The plugin repository currently carries `eval/`, an eval scope in `scripts/run-tests.mjs` and `scripts/coverage-gate.mjs`, eval scripts in `package.json`, eval entries in `.gitignore`, and an eval section in `coverage.baseline.json`. The independent `dsh-openspec-flow-eval` repository has the same harness with its own spec, tests, fixtures and coverage gate, and has passed its offline suite, dry run and real-fixture preparation.

## Goals / Non-Goals

**Goals**

- One owner for the harness and its spec.
- Plugin test and coverage commands operate on plugin code only.
- Docs point at the owning repository instead of local paths that no longer exist.

**Non-Goals**

- No plugin runtime change; `index.js`, `lib/`, `skills/` and the bundle stay untouched.
- No removal of `@fission-ai/openspec`; the plugin runtime still needs it.
- No history rewrite; archived changes keep their old `eval/` references.

## Decisions

### Delete the directory rather than keep a stub or submodule

A stub or submodule would preserve two entry points and re-create the maintenance problem. The independent repository is the single source of truth; the plugin repository links to it in docs.

### Remove the eval scope from tests and coverage

`scripts/run-tests.mjs` keeps only the `plugin` scope. `test:all` is removed because it would be an alias of `npm test`. `scripts/coverage-gate.mjs` keeps only the plugin scope, and `coverage.baseline.json` is regenerated rather than hand-edited so its Node version and commit fields stay consistent with the gate's own writer.

Alternative considered: keep the eval scope but point it at the sibling repository. Rejected because a plugin checkout would then fail its own `coverage:check` unless the sibling exists.

### Remove the capability instead of keeping a pointer spec

The plugin repository's `evaluation-harness` spec is removed with 14 `REMOVED Requirements` entries, each naming the migration target. Keeping a pointer-only spec would make this repository claim a capability it no longer implements.

### Docs name the owning repository

`README.md` and `AGENTS.md` replace the eval sections with a short pointer to `dsh-openspec-flow-eval`. No redirect file is added under `eval/`; a missing directory is clearer than a stale one.

## Risks / Trade-offs

- The plugin repository can no longer run an evaluation → the independent repository already passed `npm test`, a dry run and real-fixture preparation; commands live there.
- Some external notes or archived changes still mention `eval/` → they are historical records; no rewrite.
- `coverage:check` baseline drift after removing the eval scope → regenerate the baseline in the same change and verify the gate passes.

## Migration Plan

1. Delete `eval/` and the eval-related scripts, scope entries, baseline section and ignore rules.
2. Update `README.md` and `AGENTS.md` to point at the owning repository.
3. Run `npm test` and `npm run coverage:check` on Node 24.
4. Archive after the user asks; rollback is a revert of the change commit.

## Open Questions

None.
