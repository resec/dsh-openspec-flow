# Tasks

## 1. Manifest and release label

- [x] 1.1 Set `version` to `0.3.1` and `engines.dsh` to `=0.2.2-rc.2` in `package.json`; verify with `node -e "const p=require('./package.json'); console.log(p.version, p.engines.dsh)"` printing `0.3.1 =0.2.2-rc.2`
- [x] 1.2 Refresh `package-lock.json` with `npm install --package-lock-only`; verify `node -e "const p=require('./package-lock.json'); console.log(p.packages[''].version, p.packages[''].engines.dsh)"` matches 1.1 and `git diff --stat` shows only the root entry
- [x] 1.3 Set `metadata.generatedBy` in all five `skills/*/SKILL.md` files to `dsh-openspec-flow@0.3.1`; verify `grep -rn "generatedBy" skills/*/SKILL.md` reports `0.3.1` in every file

## 2. Documented baseline

- [x] 2.1 Update the DSH version in `README.md` (version compatibility, test runtime, verification sections); verify `grep -n "0.2.2-rc" README.md` names only `0.2.2-rc.2`
- [x] 2.2 Update the baseline and exact-pin example in `docs/upgrading-dsh-runtime.md`; verify `grep -n "0.2.2-rc" docs/upgrading-dsh-runtime.md` names only `0.2.2-rc.2`
- [x] 2.3 Update the DSH baseline in `docs/upgrading-openspec-cli.md:9`; verify `grep -n "0.2.2-rc" docs/upgrading-openspec-cli.md` names only `0.2.2-rc.2`

## 3. Candidate runtime verification

- [x] 3.1 Install `@deepseek-ai/dsh@0.2.2-rc.2` into a separate prefix and run its `dsh --version`; verify it prints `0.2.2-rc.2`
- [x] 3.2 In an isolated `DSH_HOME`, add the working tree with `link:` and run `--dump-config`; verify the output contains `id: openspec-flow` and stderr has no `skipping profile bundle`

## 4. Test matrix

- [x] 4.1 Run `npm test` with Node 24 on `PATH`; verify exit 0
- [x] 4.2 Run `npm run coverage:check` with Node 24 on `PATH`; verify exit 0 and no scope below baseline
- [x] 4.3 Run `npm run openspec:check`; verify exit 0 over active changes and main specs
- [x] 4.4 Run `openspec_inspect` with `action: "validate"` and `strict: true`; verify zero findings

## Workflow follow-up

- Archive the change with `openspec_archive`, recording that `skip_specs` applies.
- Commit the archive, the documentation updates and the manifest together, then push `main` to `origin/main`.
- Release step outside this change: replace the global install with `0.2.2-rc.2`, restart the profile, and run the live smoke matrix from `docs/upgrading-dsh-runtime.md`.
