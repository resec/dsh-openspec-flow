# Design: change-metadata gate

## Context

See [proposal.md](proposal.md) for the motivation. The relevant CLI behavior (pinned 2.2.0) is:

- `openspec validate --all --strict` reads `.openspec.yaml` only through lenient helpers. `readUnknownChangeMetadataKeys` returns an empty list on a parse error, `readSkipSpecsMarker` treats a parse error as "not declared" unless the text mentions `skip_specs:`, and `usesBuiltInSpecDrivenSchema` catches schema-resolution errors and returns false. A broken metadata file therefore produces no validation issue.
- `openspec status --change <name> --json` loads the change through `loadChangeContext`, which calls the strict `readChangeMetadata`: a parse error throws and the command exits nonzero with a `change_error` payload.
- The pull-request review watch runs `openspec status` when it prepares a review, which is why PR #30 failed there instead of in CI.

The repository's OpenSpec gate is `npm run openspec:check`, run by the CI verify job and by the pre-push hook for non-main refs.

## Goals / Non-Goals

**Goals**

- Fail `npm run openspec:check` when any active change's metadata cannot be loaded.
- Reuse the CLI's own strict loader so the gate cannot drift from the behavior that `status`, `instructions`, apply and archive enforce.
- Keep the gate testable without a network or a real broken change in the repository.

**Non-Goals**

- Changing `@fission-ai/openspec` or its validation semantics.
- Changing `.openspec.yaml` or the artifact formats.
- Reworking the review watch's retry behavior for a change that fails to load.
- Checking metadata for archived changes.

## Decisions

### Decision: run `openspec status --change` instead of parsing the YAML

Parsing `.openspec.yaml` locally with a YAML library would duplicate only the first half of the CLI's loader: it would miss schema-name membership, schema loading and any later metadata field the CLI adds. Running `status` executes the same loader the blocking commands use, so a change that passes the gate is a change the review and apply paths can load. The cost is one CLI spawn per active change, which is acceptable because a project has few active changes.

### Decision: embed the malformed fixture instead of reading the live pull request

The regression test embeds the malformed bytes verbatim:

```yaml
schema: spec-driven
created: 2026-11-22
goal: Fail the coverage gate in report mode too when the baseline is absent or
  records a Node version that fails validation, as decided on issue #10, and
  state that rule in the mode requirement.
```

`yaml.parse` of these bytes fails with `All mapping items must start at the same column at line 5, column 1`. The test feeds the same bytes to the real bundled CLI and asserts the gate exits nonzero and names the change and the parser message. A copy taken from the pull request at review time is not a fixture: the head can move, and the current head may already be fixed or rewritten.

### Decision: append the gate to `npm run openspec:check`

The CI verify job already runs `npm run openspec:check`, and the non-main pre-push hook runs the same script. Adding a separate CI step would cover pull requests only, and editing the workflow would make the gate a restricted path for external contributors. Extending the existing script keeps one gate for CI and local pushes and needs no workflow change.

### Decision: check every active change

`openspec validate --all` already checks every active change, so the metadata gate uses the same scope. A pull-request-only scope would let an active change on `main` with broken metadata pass CI and fail later, and the two scopes would drift. A broken metadata file in an unrelated in-progress change blocks the push just as a broken delta already does. The gate enumerates directories under `openspec/changes/` and skips only `archive`, matching the CLI's listing rule for active changes, which includes hidden names.

### Decision: fail closed and report every failing change

The script collects one result per change and reports all failures before exiting, so a run names every broken metadata file instead of stopping at the first. It treats an unresolvable or unexecutable CLI, a nonzero exit, an error payload with a zero exit and unreadable output as failures. Exit codes follow the existing gate style: `0` all loaded, `1` at least one change failed, `2` the gate itself could not run (usage, root or CLI).

### Decision: no cache and no `--change` scope option

The gate runs only in the OpenSpec check, where the whole active set is the point. A cache would have to be invalidated on every checkout, and a single-change option would invite callers to skip the check that CI performs.

## Risks / Trade-offs

- [A broken metadata file in another in-progress change blocks a push] → This matches `openspec validate --all`, which already fails on any active change's delta; the error names the change so the author can fix it.
- [One CLI spawn per active change slows the check] → Active changes are normally zero to three; `status` is a local read and the gate runs once per push and CI job.
- [The `status` payload shape is CLI-version-specific] → The CLI is pinned to an exact version and the plugin verifies that version; the regression test runs the real bundled CLI.
- [The gate masks the review watch's own retry behavior] → Intentional: the watch still reports a change it cannot load, but CI now catches the same class before review starts.

## Migration Plan

No data, state or configuration migration. Deploying is the commit that adds the script and extends `openspec:check`; reverting that commit restores the previous gate. No rollback constraints apply because the gate writes nothing.

## Open Questions

None.
