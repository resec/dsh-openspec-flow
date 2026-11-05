# Tasks

## 1. Dependency and resolution

- [x] 1.1 Move `@fission-ai/openspec` to `dependencies` at exact `1.16.0` and refresh `package-lock.json`; verify `npm ls @fission-ai/openspec` reports the pinned version and the lockfile no longer marks it dev-only.
- [x] 1.2 Implement `resolveBundledCli` in `lib/openspec.js` using `createRequire` plus the package `bin.openspec`, remove `cliPath`, `PATH`, and project-local lookup, and verify a unit test resolves the real installed bin.

## 2. Version gate and configuration

- [x] 2.1 Add the exact pin check, `assertCliVersion`, and the once-per-process `version --json` verification; verify unit tests cover matching, mismatched version, mismatched schema envelope, and cached verification.
- [x] 2.2 Remove `cliPath` from `Config` and reject it with a validation issue; verify a config unit test rejects `cliPath` and accepts `timeoutMs`.

## 3. Tests and documentation

- [x] 3.1 Update the fake context and integration tests to run without `cliPath`, add decoy `PATH`/project-local CLI checks, and verify the normal apply, status, mark, and validate tests pass against the bundled CLI.
- [x] 3.2 Update `README.md`, `AGENTS.md`, and `cordis.patch.yml` for the bundled exact version and removed override; verify the text no longer documents `cliPath` as a supported setting.

## 4. Verification

- [x] 4.1 Run `openspec validate bundle-pinned-openspec-cli` and `node --test test/`; verify both pass and report the output.
