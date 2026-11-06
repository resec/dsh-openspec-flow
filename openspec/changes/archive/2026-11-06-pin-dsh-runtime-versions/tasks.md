# Tasks

## 1. Manifest

- [x] 1.1 Set `engines.dsh` to `=0.2.2-rc.1` and `engines.node` to `>=24.9.0` in `package.json`; verify with `node -e` that both fields read back as written.
- [x] 1.2 Check the manifest with DSH's `evaluatePluginCompatibility`; verify it returns no unmet requirements for `0.2.2-rc.1` and reports `engines.dsh` for `0.2.3-rc.1`.

## 2. Documentation

- [x] 2.1 Add the upgrade rule to the `AGENTS.md` Plugin constraints section; verify it names `engines.dsh`, `engines.node`, and the check order.
- [x] 2.2 Add a version compatibility section to `README.md`; verify the pinned versions match `package.json` and the text names the skipped-bundle symptom.

## 3. Verification

- [x] 3.1 Run `openspec_validate pin-dsh-runtime-versions` and `node --test test/`; verify both pass and no test file changed.

## Workflow follow-up

- Archive the change only on an explicit request.
