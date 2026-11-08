# Design: Upgrade the bundled OpenSpec CLI to 1.16.1

## Context

See `proposal.md` — Why. The pin lives in `package.json`, `lib/openspec.js` derives `PINNED_CLI_VERSION` from it, and `assertCliVersion` rejects any other reported version or a `schemaVersion` other than `1`. Five packaged skills stamp `metadata.upstream` and every tool description derives from projections over the CLI's JSON. The repository gates a change on `openspec validate`, `npm test` on Node 24 and `npm run coverage:check`.

The previous change added `docs/upgrading-openspec-cli.md` and `scripts/check-cli-contract.mjs`, so this upgrade follows the documented procedure rather than inventing one.

## Goals / Non-Goals

Goals:

- Move the exact pin to 1.16.1 with the smallest edit set that keeps the version gate, skill metadata, tests and documentation consistent.
- Prove the projection still holds before and after the pin moves.
- Cover the two delta-parsing changes in the plugin's own tests, because they change what `openspec_validate` and `openspec_archive` return to users.

Non-Goals:

- No change to `lib/` runtime logic, tool schemas, output projections, the schema gate, or the instruction-command map.
- No re-measurement of the token-cost figures in `README.md`: the `instructions` text is byte-identical between the two versions, so the recorded numbers describe the same payload.
- No plugin feature work beyond the dependency upgrade and its documentation.

## Decisions

### Adopt 1.16.1 rather than skip the patch

The candidate was checked before any edit:

- `npm run contract:check -- --candidate 1.16.1` exits 0 with `RESULT: compatible`; every command reports `no shape change`, and only the empty-store fixture paths are unobserved.
- The extracted 1.16.1 package differs from 1.16.0 in 11 `dist/` files, all under `core/parsers`, `core/validation`, `core/specs-apply` and `core/version-check`; `dist/utils/task-progress.js` and every instruction template are unchanged.
- `instructions proposal|specs|design|tasks|apply --json` returns a byte-identical `instruction` string on the same fixture.
- `version --json` reports `version: 1.16.1` and `schemaVersion: 1`; `engines.node` stays `>=22.12.0`, below the plugin's `>=24.9.0`.

Alternative: stay on 1.16.0. Rejected — 1.16.1 stops archive from silently dropping a requirement placed under an unrecognized `## ... Requirements` section, which is the failure mode this plugin's archive path exists to surface.

### Bump the plugin to 0.2.1

Skill frontmatter must name the plugin release that carries the dependency. `lib/skills.js` derives `generatedBy` from `package.json`, and `test/skills.test.mjs` enforces the match, so a pin move without a version bump would ship skills stamped `dsh-openspec-flow@0.2.0` while the plugin content changed. The upgrade guide's release step names this decision explicitly.

Alternative: keep 0.2.0. Rejected — the metadata would claim a release that does not contain the new pin.

### Keep the projections untouched

The contract check compares JSON shape, not values, and reports no shape change for any command. The instruction text and the task-line parser are byte-identical, so `lib/state.js`, `lib/tools/`, `lib/schema.js` and the `INSTRUCTION_COMMAND_MAP` need no edit. The only runtime file that changes is `lib/tasks.js`, whose module comment names the mirrored CLI version; the regex itself is unchanged.

Alternative: pre-emptively adapt the projections to the parser changes. Rejected — there is no payload difference to adapt to, and speculative edits would add untested code.

### Test the parsing changes through the tool surface

The upstream change is observable through two tools, so two integration tests exercise it with the real bundled CLI:

- a delta with `## ADDED Requirements ##` is listed by `openspec_show` and validated by `openspec_validate`;
- a delta with a requirement under `## DEPRECATED Requirements` makes `openspec_validate` return `valid: false` with an error that names the requirement, and `openspec_archive` return `valid: false`, `archived: false` while the change directory stays in place.

The archive case runs the tool's own pre-validation branch (`lib/tools/write.js`), which is the reason the plugin returns findings instead of the CLI's `archive_validation_failed` status.

Alternative: rely on upstream tests. Rejected — the plugin's contract is its tool result, and only a test here proves the pre-validation branch still reports and does not move files.

### Remove the version from the `skill-adaptation` scenario

The scenario describes behavior that does not depend on a specific patch: the instruction text maps CLI fragments to tool names. Naming `1.16.0` made the main spec stale on every upgrade and forced a spec edit for a version bump. The scenario now says "on the bundled OpenSpec CLI", which the `cli-bundling` capability already defines.

Alternative: replace `1.16.0` with `1.16.1`. Rejected — it recreates the same churn at the next upgrade.

## Risks / Trade-offs

- [A user's existing change carries a requirement under an unrecognized section and now fails validation] → This is the intended upstream behavior; `openspec_archive` returns the findings and leaves files untouched, and the README states the stricter validation in its limits.
- [The pin moves before the tests do, so an intermediate test run fails] → Follow the guide's order: pin and lockfile first, assertions next, then tests, then documentation; the full gate runs at the end.
- [The lockfile gains or drops transitive packages] → Inspect the `npm install` result and `npm ls @fission-ai/openspec`; the dependency tree is not otherwise constrained.
- [README measurements are attributed to a newer CLI than they were taken on] → The instruction payload is byte-identical, so the numbers still describe it; the environment line is updated with that reasoning recorded here rather than silently re-labeling.
- [Coverage drops because new branches are uncovered] → The two new tests exercise both parsing paths; `npm run coverage:check` must pass before completion.

## Migration Plan

No data migration. An installed plugin picks up the new CLI by reinstalling the bundle or running `npm install` in a linked checkout. Rollback restores `package.json`, `package-lock.json`, the five skills, the tests and the documentation to 1.16.0 / 0.2.0, reruns `npm install`, then reruns the same gates.

## Open Questions

None.
