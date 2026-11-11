# Add a DSH runtime upgrade guide

## Why

The plugin pins `engines.dsh` to one exact DSH runtime and registers its tools, skills and policy section against that runtime's services, but the only upgrade instructions are four lines in `README.md`. Nothing inventories the services, events and tool fields the plugin reads, states how the compatibility gate rejects a mismatch, or describes how to verify a candidate runtime before moving the pin.

## What Changes

- Add `docs/upgrading-dsh-runtime.md`, an operator guide for an upgrade:
  - explain the compatibility gate: `engines.dsh` decides alone, exact-version semantics, install rejection, profile skip and exact-version exemptions;
  - record the target release's facts: release notes and compare link, npm publication, declared `engines.node`, primary Node major;
  - inventory every DSH coupling by plugin file and DSH contract;
  - order the edits across `package.json`, coverage config, `project-invariants`, README and this guide;
  - verify a candidate runtime in an isolated install and profile, then in a live boot;
  - run the test matrix, release, and roll back a rejected upgrade.
- Add a `development-workflow` requirement for the documented DSH upgrade procedure.
- Link the guide from the version-compatibility section of `README.md` and replace the inline four-step DSH procedure with the link.

Not included: no change to `engines.dsh`, `engines.node`, `lib/`, `index.js`, the packaged tool surface or the OpenSpec CLI pin; no runtime upgrade and no new script.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `development-workflow`: add a requirement that DSH runtime upgrades follow one documented procedure with recorded facts, ordered edits, candidate verification, rollback, and no exemption treated as verification.

## Impact

- New: `docs/upgrading-dsh-runtime.md`.
- Edited: `README.md` (version-compatibility section), `openspec/specs/development-workflow/spec.md` after archive.
- Unchanged: `package.json`, `package-lock.json`, runtime code, tool schemas, packaged skills.
