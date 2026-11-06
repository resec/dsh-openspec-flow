# Pin the DSH runtime range and align the Node range

## Why

The plugin declares only `node >=22.12.0` and no DSH version, so DSH treats it as compatible with every runtime, including future alpha versions whose service contracts differ. DSH 0.2.2-rc.1 requires Node >=24.9.0, so the plugin's lower floor also claims a Node 22 combination that the host cannot run.

## What Changes

- Declare `engines.dsh: "=0.2.2-rc.1"` so DSH's install and startup checks accept only the runtime the plugin is verified against. **BREAKING**: DSH versions other than 0.2.2-rc.1 refuse to load the plugin unless the user grants an exact-version exemption.
- Change `engines.node` from `>=22.12.0` to `>=24.9.0` to match the DSH runtime's Node floor.
- Document the rule: when the DSH dependency is upgraded, read that DSH version's `engines.node` and re-align the plugin's `engines.node`, then update `engines.dsh` to the new exact runtime.
- Add the rule to the `development-workflow` spec, `AGENTS.md`, and `README.md`.
- Do not add a test assertion; the check is manual and depends on the installed DSH tree.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `development-workflow`: adds a `DSH runtime version alignment` requirement covering the exact `engines.dsh` pin, the `engines.node` alignment, and the upgrade check.

## Impact

- Affected specs: `openspec/specs/development-workflow/spec.md`
- Affected files: `package.json`, `AGENTS.md`, `README.md`
- Runtime behavior: DSH refuses to load the plugin on runtimes other than 0.2.2-rc.1; exact-version exemptions remain available through the profile's `compatibility.json`.
- No test changes.
