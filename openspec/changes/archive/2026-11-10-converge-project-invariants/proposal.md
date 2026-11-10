# Convergence of project invariants

## Why

The repository holds 68 requirements across nine capabilities. Three values cross capability boundaries: the Node runtime baseline (`engines.node`), the exact `@fission-ai/openspec` pin with its `schemaVersion`, and the coverage floors. Each is restated today:

- `coverage-gate` spells out `>=24.9.0`, `v24.22.2` and `v24.9.0`, while `development-workflow` declares the same `engines.node` range re-alignable on every DSH upgrade.
- The CLI pin lives in `package.json`, the lockfile, the README and the version assertions; no spec says which copy is authoritative.
- The coverage floors appear in `coverage-gate` and again in `coverage.config.json`.

`openspec validate` reads one spec at a time, so a correct edit to one copy leaves the others stale with no failure. A prior audit found exactly that shape here: `coverage-gate` freezes a value that `development-workflow` declares mutable. The same audit found the schema-gate tool list differing between `schema-compatibility` and `tool-surface`; repairing that list is a separate change and stays out of scope.

At 68 requirements this duplication is still reviewable by hand. The cost grows with every capability added.

## What Changes

- New `project-invariants` capability states the Node baseline, the OpenSpec CLI pin and the coverage floors once, as its own requirements.
- `coverage-gate`, `cli-bundling` and `development-workflow` reference that capability instead of restating the values.
- `README.md` and `AGENTS.md` point at the capability rather than repeating the values.
- No registry file, no new test, no code change. The single-source rule is a review convention: nothing fails automatically when a consumer restates a value.

## Capabilities

### New Capabilities

- `project-invariants`: the stated values more than one capability depends on, plus the rule that consumers reference them.

### Modified Capabilities

- `coverage-gate`: the Node preflight and the coverage floors reference the capability instead of restating values.
- `development-workflow`: the DSH runtime alignment references the capability.
- `cli-bundling`: the pinned CLI version references the capability.

## Impact

- `openspec/specs/project-invariants/spec.md` after archive, and the three consumer delta specs.
- `README.md` and `AGENTS.md` wording.
- No change to `lib/`, `skills/`, the pinned versions, or the test suite.
