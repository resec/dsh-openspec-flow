# Design: move the DSH pin to 0.2.2-rc.2

## Context

See `proposal.md` — Why. The plugin declares `engines.dsh: "=0.2.2-rc.1"` and the compatibility gate reads that field alone: `evaluatePluginCompatibility` in `@deepseek-ai/dsh-app-boot` prefers `engines.dsh` and only falls back to `peerDependencies` when the field is absent (`docs/upgrading-dsh-runtime.md:39`). `peerDependencies` carries no DSH entry today, and the target version declares none either, so moving the pin is a one-field manifest edit plus the documents that name it.

The upgrade procedure this design follows is `docs/upgrading-dsh-runtime.md`; it already requires recording the target facts, ordering the edits, verifying a candidate runtime in an isolated profile, and keeping the Node baseline in `project-invariants`.

## Goals / Non-Goals

**Goals**

- Move the exact pin to `0.2.2-rc.2` and keep every document that names the pin consistent.
- Establish with evidence whether any DSH member the plugin reads changed between rc.1 and rc.2, before deciding not to touch runtime code.
- Prove the manifest gate and bundle composition accept the plugin under the candidate runtime.

**Non-Goals**

- Replacing the live global install or running a live boot smoke test in this change. This session runs on rc.1; swapping `/usr/lib/node_modules` would interrupt it. The guide's release step covers that smoke test.
- Changing requirement text, the Node baseline, the coverage baseline, tool schemas, or the OpenSpec CLI pin.
- Touching the eval repository. It derives the DSH version from the tested plugin's `engines.dsh`, so its next run installs rc.2 without edits.

## Decisions

### Move only `engines.dsh`; leave `engines.node` and the coverage baseline

The target package metadata declares `engines.node: ">=24.9.0"`, identical to rc.1, and its primary Node major stays 24. Per the `project-invariants` Runtime baseline requirement, `engines.node` mirrors the pinned runtime's declared floor, so it does not move. Changing `coverage.config.json` or the baseline would be an unmotivated edit.

### Declare `skip_specs: true` instead of inventing a delta

No requirement text changes. `project-invariants` states the Node baseline, not the DSH version; `development-workflow` states that upgrades must follow the documented procedure and this change follows it. The OpenSpec CLI accepts zero deltas only when `.openspec.yaml` sets `skip_specs: true`, and its own guidance reserves that marker for changes with no spec-level behavior. Both conditions hold.

### Do not change runtime code

The contract diff between rc.1 and rc.2 was read from the published type declarations, not assumed:

| DSH package | rc.1 → rc.2 change | Plugin use | Decision |
| --- | --- | --- | --- |
| `dsh-app-boot` | `evaluatePluginCompatibility` keeps `engines.dsh` precedence and `includePrerelease: true` | The gate itself | Pin move only |
| `dsh-agent` | Removes `parentAgent`, `enter(agent, owner)`; `runtime-types.d.ts` gains one comment line; `agent/status` unchanged | `agents.list()`, `agent/created`, `agent/status` | No change |
| `dsh-tools` | Adds `ToolContextUnavailableError`, `ToolErrorInfo`, `ToolGuardDenial`; `ToolGuard` may return a denial object | Registers tools; implements no guard | No change |
| `dsh-subprocess` | `SubprocessExecutableNotFoundError` moves to `error.ts` and is re-exported from the index | Spawn result is passed through; the class is not caught | No change |
| `dsh-working-directory` | Adds `WorkingDirectoryError`, `working-directory/access`; records error codes per failure | Calls `ensure`, `get`, `defaultDirectory`; does not branch on error codes | No change |
| `dsh-system-prompt` | Removes `TEAM_IDENTITY`, adds `TOOL_PTY_PANEL` | Calls `section` with `getSectionOrder('PLAN_POLICY')` | No change |
| `dsh-skill`, `dsh-commands` | No declaration diff | `registerProvider`, `register` | No change |

The release notes' plugin-facing items map onto these declarations: clearer tool failure types add the `info` identity and do not change the fields the plugin writes; AgentTeam's named subagents change `dsh-agent` creation options the plugin never passes; batched session appends are a session API the plugin does not wrap. The plugin's own error handling passes subprocess and working-directory failures through unchanged, so new error subclasses do not alter behavior.

### Bump to 0.3.1 rather than 0.4.0

Repository history bumps the minor for behavior changes (0.1.0 → 0.2.0 for the skill flow change, 0.2.1 → 0.3.0 for the tool merge) and the patch for a dependency-compatibility move (0.2.0 → 0.2.1 for the OpenSpec CLI upgrade). A runtime pin move is the second kind.

### Verify in an isolated profile, not by replacing the global install

`docs/upgrading-dsh-runtime.md:51-53` requires an independent `DSH_HOME`, because `--dump-config` rewrites the profile's `cordis.yml`. The candidate runtime is therefore installed under a separate prefix, the working tree is added with `link:`, and `--dump-config` is checked for the `openspec-flow` row and the absence of `skipping profile bundle`. This proves the manifest gate and patch composition; it does not mount the plugin, so the guide's live-boot row stays a release step.

## Risks / Trade-offs

- **The isolated check cannot prove service contracts.** `--dump-config` mounts nothing (`docs/upgrading-dsh-runtime.md:227`). → Mitigated by the declaration diff above and by the plugin test suite, which uses a fake Host context modelled on the same services.
- **The live boot stays unverified until release.** A contract break that only appears at mount time would surface after publishing. → The candidate is a prerelease; the release step in the guide replaces the global install and requires the smoke matrix before the new pin is announced, and rollback restores the two version strings.
- **Prerelease pinning.** `=0.2.2-rc.2` matches only that exact prerelease. → Intended: the guide forbids `^`, `~` and `>=` for this field, and `includePrerelease` does not widen an exact range.
- **The lockfile drifts if edited by hand.** `package-lock.json` mirrors the root package's `engines.dsh`. → Refresh it with `npm install`, which regenerates that entry, and verify the diff is limited to it.

## Migration Plan

1. Edit `package.json`: version 0.3.1, `engines.dsh` `=0.2.2-rc.2`; refresh `package-lock.json`.
2. Sync the five packaged skills' `metadata.generatedBy`.
3. Update `README.md`, `docs/upgrading-dsh-runtime.md`, `docs/upgrading-openspec-cli.md`.
4. Install rc.2 into a separate prefix, link the working tree into an isolated `DSH_HOME`, and check `--dump-config`.
5. Run `npm test`, `npm run coverage:check`, `npm run openspec:check` on Node 24.
6. Archive the change, commit and push; the release step replaces the global install and runs the live smoke matrix. Rollback restores the two version strings and the three documents.

## Open Questions

None.
