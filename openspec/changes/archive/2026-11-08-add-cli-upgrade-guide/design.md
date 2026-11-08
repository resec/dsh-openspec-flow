# Design: OpenSpec CLI upgrade guide and contract check

## Context

See `proposal.md` — Why. The plugin pins one CLI version and reads its JSON in `lib/state.js`, `lib/tools/query.js`, `lib/tools/write.js`, `lib/tools/shared.js`, `lib/schema.js` and `lib/tasks.js`. `lib/openspec.js:47` derives the pin from `package.json`, and `assertCliVersion` at `lib/openspec.js:143` rejects any other version, so an upgrade always touches the manifest and the version assertion.

The repository already gates changes with `npm test` and `npm run coverage:check` on Node 24 (`AGENTS.md`). The CLI's JSON is exercised against the real dependency by `test/integration.test.mjs` and `test/e2e.test.mjs`, but those tests describe expected projections, not the full set of fields the projection reads.

## Goals / Non-Goals

Goals:

- One operator document that states the decision inputs, the coupling inventory, the edit order, the verification matrix, the release step and the rollback.
- One development-only check that records the JSON shape of the pinned CLI and a candidate CLI over the same fixture, then fails when a consumed field is missing or changes type.

Non-Goals:

- No automatic upgrade, no network access from `npm test`, and no change to the runtime pin.
- No attempt to model OpenSpec's schema semantics; `docs/upgrading-openspec-cli.md` covers that boundary separately.
- No dependency on `@deepseek-ai/*` or any new package.

## Decisions

### The consumed-field list lives in `scripts/cli-contract.json`

The list is data, not code: a reviewer of an upgrade can see each command and its fields without reading the script. `scripts/check-cli-contract.mjs` exports pure functions that take the list as an argument, so `test/cli-contract.test.mjs` covers them with synthetic shapes and no CLI process.

Alternative: derive fields from the projections at runtime. Rejected — it would couple the check to module internals and would report a field as consumed only when a fixture produces it, which is exactly the signal the check must not depend on.

### The check compares shapes, not values

`shapeOf` turns a parsed payload into `{ type, keys }` recursively: objects keep their key set, arrays merge their element shapes, and scalars keep `typeof`. Values change between runs (paths, timestamps, counts); comparing them would make the check flaky. The diff reports added, removed and type-changed paths.

Alternative: snapshot the full JSON and diff it. Rejected — every fixture run embeds temp paths and task ids, so a raw diff cannot be reviewed.

### The candidate is either a version or a local binary

`--candidate <version>` downloads the tarball with `npm pack` into a temporary directory whose npm cache is also temporary, so the check does not depend on the caller's npm cache. `--candidate-bin <path>` accepts an already-installed CLI and performs no registry access. The pinned CLI is the baseline unless `--baseline-bin` overrides it.

Alternative: install the candidate into `node_modules`. Rejected — it would change the working tree and make a failed check hard to roll back.

### The fixture is built from scratch for each CLI

Each CLI gets its own temp project: `init --tools none --no-animation`, `new change fixture --json`, fixed `proposal.md`, `specs/fixture/spec.md`, `design.md` and `tasks.md`, a main spec at `openspec/specs/fixture/spec.md`, and a completed copy for `archive`. Commands run in the same order: `version`, `list`, `list --specs`, `status`, `instructions proposal`, `instructions apply`, `show` (change and spec), `context`, `schemas`, `store list`, `validate`, `validate --specs`, and `archive` last.

Commands that legitimately exit non-zero still carry JSON (`lib/openspec.js:337-343` documents the same contract for the plugin). The check reads JSON regardless of exit code but records the exit code and stderr, and fails when the output is not parseable JSON.

### Empty arrays are "unobserved", not "missing"

An empty array contributes no element shape. A consumed path that traverses an unobserved element is reported as a warning, not a failure, because the fixture cannot prove the element's fields. The fixture is designed to produce at least one element for the arrays the plugin reads (`changes`, `specs`, `tasks`, `deltas`, `requirements`, `artifacts`, `items`, `schemas`, `stores`), so a real removal is still a failure; a warning points at a fixture gap.

## Risks / Trade-offs

- [npm registry unavailable or `npm pack` fails] → `--candidate-bin` is the documented fallback; the guide lists it as the offline path.
- [A CLI command changes its non-zero exit behavior] → The check records exit code and stderr for every command and names the failing one; it does not infer success from an exit code.
- [The fixture itself becomes invalid on a newer CLI] → The check fails at the fixture command and prints the CLI's stderr, so the maintainer fixes the fixture before reading a shape diff.
- [The consumed-field list drifts from the code] → `test/cli-contract.test.mjs` asserts that every top-level command name in the list matches the command set the plugin runs, and the guide's checklist asks for the list to be updated whenever a tool adds a field.
- [Coverage gate] → `scripts/**` is outside the `lib/**` and `index.js` include list in `scripts/run-tests.mjs`, so the new script does not lower coverage; the test file still runs under `npm test`.

## Migration Plan

No data migration. An upgrade follows the guide: change the manifest and lockfile, run the contract check against the candidate, update assertions, skills and documentation, run the full gates on Node 24, publish a new plugin version, restart DSH, and smoke-test the tool surface. Rollback restores the previous manifest, lockfile and documentation and reruns the same gates.

## Open Questions

None.
