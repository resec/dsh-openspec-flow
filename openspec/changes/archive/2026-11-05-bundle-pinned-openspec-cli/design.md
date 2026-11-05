# Design: Bundle a pinned OpenSpec CLI

## Context

`lib/openspec.js` resolves the CLI from `cliPath`, then `PATH`, then `<cwd>/node_modules/.bin/openspec`. The tool projections read fields that OpenSpec does not version as a public contract, and the schema gate assumes the resolved CLI's package `schemas/` directory. Allowing an arbitrary executable therefore undermines both the 1.16.0 assumptions and the schema gate.

## Goals / Non-Goals

**Goals**

- One executable source: the `@fission-ai/openspec` package installed in the plugin's own tree.
- Exact version pin and a runtime check of the CLI's reported version and JSON envelope.
- No silent fallback and no new per-call CLI process.
- Actionable errors for a broken plugin installation.

**Non-Goals**

- Supporting multiple CLI versions or a user-selected CLI.
- Vendoring the CLI's source into this repository.
- Running `openspec init` or installing the CLI into a target project.

## Decisions

### Move the CLI to an exact runtime dependency

`@fission-ai/openspec` moves from `devDependencies` to `dependencies` at `1.16.0`, without a range. The package manager installs it with the plugin, so the CLI version is part of the plugin's installation rather than the target project's environment. The lockfile is regenerated so the dependency is no longer marked development-only.

A linked local install must run `npm install` or `pnpm install` in the plugin directory; the README states this.

### Resolve the bin from the plugin's own package tree

`createRequire(import.meta.url).resolve('@fission-ai/openspec')` locates the package entry relative to `lib/openspec.js`, independent of the session working directory and `PATH`. From that entry the resolver walks up to the package directory whose `package.json` has `name: "@fission-ai/openspec"`, reads its `bin.openspec`, and requires the file to exist. Walking up instead of assuming `dist/index.js` keeps the resolver working if the package's entry layout changes.

The resolved `bin` is a JavaScript file. `runOpenSpec` executes it as `[process.execPath, bin, ...args]`, so the Host's Node runtime is used and the target project needs no Node installation.

### Verify the version once per process

The first `runOpenSpec` call spawns `version --json` through the same capture path, parses the JSON, and checks:

- `version === PINNED_CLI_VERSION`;
- `schemaVersion === 1`.

A successful result caches the verification promise. A failure clears it so a later call can retry after the installation is repaired. The check runs before the requested command, so a mismatched CLI never produces a projection.

`PINNED_CLI_VERSION` is read from this plugin's `package.json` dependency value. The resolver requires that value to be an exact semver; a range is treated as a plugin misconfiguration.

### Remove `cliPath`

`Config` keeps only `timeoutMs`. A supplied `cliPath` produces a validation issue rather than being ignored, so an operator who still has the old row config sees that the setting has no effect.

## Risks / Trade-offs

- A registry install that skips dependencies cannot run the plugin. The error names the missing package and tells the user to reinstall; this is preferable to silently executing another version.
- pnpm's strict layout can hoist the dependency outside the plugin directory. `createRequire` still resolves through pnpm's links; tests run against the plugin's real installation tree.
- The package layout is not a public API. The resolver verifies the package name and `bin.openspec` exists, and a test exercises the real installation.
- The version check adds one subprocess on the first CLI call per process. Subsequent calls reuse the cached verification.
- A CLI file replaced after verification stays cached until the process restarts. The plugin is installed as a unit, so an in-place replacement is an out-of-band change.

## Migration Plan

No data migration. Remove `cliPath` from any bundle row config; the plugin reports it as unsupported. Reinstall or run the package manager in the plugin directory after upgrading so the runtime dependency is present.
