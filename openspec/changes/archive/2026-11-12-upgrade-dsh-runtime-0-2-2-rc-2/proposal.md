# Upgrade the DSH runtime pin to 0.2.2-rc.2

## Why

The plugin pins `engines.dsh` to `=0.2.2-rc.1`. Upstream published `0.2.2-rc.2` on 2026-11-11 and its release notes list migration items for plugins and SDK integrations: tool failures carry new error types and codes, AgentTeam moves to unified named subagents, plugins can register and remove MCP servers dynamically, and sessions accept batched event appends. Each item must be checked against this plugin. Staying on rc.1 leaves the compatibility claim behind the maintained release line and leaves those items untriaged.

## What Changes

- Move `engines.dsh` from `=0.2.2-rc.1` to `=0.2.2-rc.2` in `package.json` and refresh `package-lock.json`.
- Bump the plugin version from 0.3.0 to 0.3.1, so every packaged skill's `metadata.generatedBy` names the release that carries this runtime.
- Update the DSH version named in `README.md` (version compatibility, test runtime, verification), `docs/upgrading-dsh-runtime.md` (baseline and the exact-pin example) and `docs/upgrading-openspec-cli.md` (baseline).
- Verify the candidate runtime in an isolated `DSH_HOME`: install `0.2.2-rc.2`, install the working tree with `link:`, and confirm `--dump-config` contains the `openspec-flow` row with no `skipping profile bundle` diagnostic.
- Record the contract diff for every DSH member the plugin reads, so the decision not to touch runtime code is evidence-backed rather than assumed.

Not included: `engines.node` stays `>=24.9.0`, because the target declares the same floor; the primary Node major stays 24, so `coverage.config.json` and the coverage baseline are untouched. No change to `lib/`, `index.js`, tool schemas, packaged skill text beyond the release label, the OpenSpec CLI pin or any requirement text. The live global install is not replaced and no live boot smoke test runs in this change: this session runs on rc.1, and replacing `/usr/lib/node_modules` would interrupt the session. That smoke test stays the release step described by the upgrade guide.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The change moves a pinned value and the documents that name it. `project-invariants` states the Node baseline in general terms and the baseline does not move; `development-workflow` already requires DSH upgrades to follow the documented procedure, and this change follows it without changing the requirement. `.openspec.yaml` therefore sets `skip_specs: true`.

## Impact

- `package.json`: `engines.dsh` and `version`.
- `package-lock.json`: the root package entry mirrors `engines.dsh`.
- `README.md`: version compatibility, test runtime and verification sections.
- `docs/upgrading-dsh-runtime.md`, `docs/upgrading-openspec-cli.md`: baseline version strings.
- `skills/*/SKILL.md`: five `metadata.generatedBy` values.
- Runtime code: none; the services and events the plugin reads are unchanged between rc.1 and rc.2 (recorded in `design.md`).
- Downstream: the eval repository derives the DSH version from `engines.dsh`, so its next run installs rc.2 without code changes.
