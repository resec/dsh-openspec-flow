# Design

## Context

See `proposal.md` for the motivation. The constraint that shapes this design is that DSH decides compatibility from the plugin manifest before any plugin code runs: the plugin cannot observe, negotiate or report its own mismatch at load time. The plugin's test suite uses a fake Host context, so passing tests cannot prove the real service contract either. Verification therefore has to combine static declarations, profile composition and a live boot.

The analogous CLI guide (`docs/upgrading-openspec-cli.md`) relies on a machine contract check because that CLI exposes stable JSON. DSH exposes Cordis services and TypeScript declarations instead, so the same mechanism does not transfer.

## Goals / Non-Goals

- Goal: one procedure a maintainer can follow from target selection through rollback.
- Goal: state what each verification step does and does not prove.
- Non-goal: automate the candidate install, declaration diff or live boot.
- Non-goal: change any runtime code, manifest value or dependency in this change.

## Decisions

- Document the gate instead of adding a check script. A DSH contract check would have to reproduce bundle resolution, Cordis service lookup and TypeScript declaration parsing; that logic changes with DSH itself and would fail in ways unrelated to the plugin. The guide uses declaration diffs, `--dump-config` and a live boot instead.
- Separate pre-flight from the live boot and name the limit of each. `--dump-config` proves the manifest gate and patch composition but does not mount the plugin; the fake-context tests prove plugin logic but not the Host contract. Only a boot of the target runtime registers the tools, skills and policy against the real services.
- Use an isolated `DSH_HOME` plus a `link:` install for pre-flight. Profile preparation rewrites `cordis.yml`, so a pre-flight against the live home would mutate it; a linked install keeps the repository as the only source of plugin code.
- Keep exact-version exemptions out of the release path. An exemption exists to diagnose a mismatch; recording one would hide the gate that the upgrade is meant to satisfy.
- State the current pin once in the guide's baseline and point edits at the files that carry it, so an upgrade has one starting point and the document does not accumulate version-to-version history.

## Risks / Trade-offs

- [Declaration diffs miss runtime behavior] → the live boot is mandatory, and the guide labels pre-flight as insufficient.
- [Line references rot as code changes] → the inventory is dated and tells the reader to re-grep after an upgrade.
- [A candidate install needs network and disk] → the guide keeps it in a temporary prefix and allows an existing target installation to stand in for the diff baseline.
- [A maintainer treats an exemption as verification] → the guide rejects it explicitly and adds it as a negative check.

## Migration Plan

This change ships documentation and a spec delta only. There is no runtime migration and no dependency change. Archive merges the `development-workflow` delta into the main spec; the guide itself describes the release and rollback steps for future upgrades.

## Open Questions

None.
