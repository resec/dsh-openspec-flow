# Design: Pin the DSH runtime range and align the Node range

## Context

See [proposal.md](proposal.md). The installed DSH 0.2.2-rc.1 declares `engines.node: ">=24.9.0"`, and its app-boot compatibility check reads `engines.dsh` first, otherwise `peerDependencies` on `@deepseek-ai/dsh*`; it never reads `engines.node`. The plugin is linked into the `web` profile, so the profile reads this repository's `package.json` directly.

## Goals / Non-Goals

**Goals**: make the plugin load only on the verified DSH runtime; make the Node declaration reflect the host's floor; state the upgrade procedure where maintainers and agents will find it.

**Non-Goals**: adding an automated version assertion; supporting several DSH runtimes at once; changing plugin runtime code; managing profile exemptions.

## Decisions

### Decision: exact `=0.2.2-rc.1` instead of a range

DSH is still alpha and the plugin uses five host services (`tools`, `subprocess`, `workingDirectory`, `systemPrompt`, `agents`), so an untested runtime can break at load time. An exact pin makes every upgrade an explicit edit. A caret range such as `^0.2.0` would accept unverified alphas, and `^0.2.2` would not even match the current `0.2.2-rc.1` because prereleases sort below the release. `peerDependencies` would bind every `@deepseek-ai/dsh*` package to an exact internal version and is reserved for packages published in lockstep with DSH.

### Decision: align `engines.node` to `>=24.9.0`

The plugin runs inside the DSH process, so its real Node floor is DSH's floor. Keeping `>=22.12.0` would claim a host combination that cannot exist. Omitting the field, as the official internal bundles do, is legitimate but less clear for a third-party package. `engines.node` remains declarative: DSH does not enforce it, and pnpm's `engine-strict` is not enabled in the profile.

### Decision: document the rule in three places with distinct roles

The `development-workflow` spec states the normative rule and scenarios; `AGENTS.md` gives the operational upgrade step for agents; `README.md` explains the pinned versions and the symptoms of a mismatch for users. Each text stays short and does not repeat the others.

## Risks / Trade-offs

- [Every DSH upgrade now requires a manifest edit and may skip the bundle] → Intended. `README.md` names the skipped-bundle message and the `compatibility.json` exemption path.
- [`engines.node` drifts when DSH raises its floor] → The upgrade step in `AGENTS.md` requires reading DSH's `engines.node` first; no automated assertion, by request.
- [The exact pin blocks testing a newer release candidate] → An exact-version exemption is the escape hatch; no manifest edit is needed for a one-off run.

## Migration Plan

1. Edit `package.json`: set `engines.dsh` and `engines.node`.
2. Restart DSH or recompose the `web` profile; verify stderr has no `skipping profile bundle` line and the `openspec_*` tools register.
3. Rollback: remove `engines.dsh` and restore `engines.node` to `>=22.12.0`.

## Open Questions

None.
