# Tasks

## 1. Dependency pin and install tree

- [x] 1.1 Change the `@fission-ai/openspec` dependency in `package.json` from `1.16.0` to the exact `1.16.1` and run `npm install`; verify `node -e "console.log(require('./node_modules/@fission-ai/openspec/package.json').version)"` prints `1.16.1` and `npm ls @fission-ai/openspec` reports a single exact `1.16.1` with no invalid or extraneous entry.
- [x] 1.2 Verify the refreshed lockfile and version envelope: `git diff package-lock.json` changes only the `@fission-ai/openspec` version, resolved URL and integrity, and `node node_modules/@fission-ai/openspec/bin/openspec.js version --json` reports `version: "1.16.1"` and `schemaVersion: 1`.

## 2. Version assertions and skill metadata

- [x] 2.1 Update the hardcoded `PINNED_CLI_VERSION` assertion in `test/openspec.test.mjs` to `1.16.1`; verify `node --test test/openspec.test.mjs` passes.
- [x] 2.2 Set `package.json` `version` to `0.2.1`, update `metadata.generatedBy` to `dsh-openspec-flow@0.2.1` and `metadata.upstream` to `openspec@1.16.1` in the five files under `skills/*/SKILL.md`, and update the upstream assertion in `test/skills.test.mjs`; verify `node --test test/skills.test.mjs` passes and `grep -rn "openspec@1.16.0\|dsh-openspec-flow@0.2.0" skills test` prints nothing.
- [x] 2.3 Update the mirrored-version comment in `lib/tasks.js` from `1.16.0` to `1.16.1`; verify `node --test test/tasks.test.mjs` passes and the regex itself is unchanged.

## 3. Regression tests for delta parsing

- [x] 3.1 Add an integration test that builds a change whose delta section is `## ADDED Requirements ##`; assert `openspec_show` lists the requirement and `openspec_validate` returns `valid: true`; verify `node --test test/integration.test.mjs` passes.
- [x] 3.2 Add an integration test that builds a delta with one valid `## ADDED Requirements` requirement and a second requirement under `## DEPRECATED Requirements`; assert `openspec_validate` returns `valid: false` with an error naming the misplaced requirement, `openspec_archive` returns `valid: false` and `archived: false`, and the change directory still exists; verify `node --test test/integration.test.mjs` passes.

## 4. Documentation

- [x] 4.1 Update every `1.16.0` in `README.md` to `1.16.1` and repoint both reference links to tag `v1.16.1`; verify `grep -n "1\.16\.0" README.md` prints nothing and both new links return HTTP 200.
- [x] 4.2 Update the pin in `AGENTS.md` and the comment in `cordis.patch.yml`; verify `grep -rn "1\.16\.0" AGENTS.md cordis.patch.yml package.json skills` prints nothing.
- [x] 4.3 Rewrite the baseline and the "版本示例：1.16.0 到 1.16.1" section of `docs/upgrading-openspec-cli.md` to record the completed upgrade and its measured results (contract check, changed-file inventory, byte-identical instructions, parsing tests); verify every command in the edited section runs as written and every file:line reference still points at the named content.
- [x] 4.4 Re-check the two README tables against the `v1.16.1` CLI and skills references; verify the command count, the 12-skill inventory and each "插件支持" cell still match the tag's reference pages.

## 5. Integration verification

- [x] 5.1 Run `npm run contract:check` with the pinned CLI as both baseline and candidate; verify exit code 0, `RESULT: compatible`, and no `FAIL` line.
- [x] 5.2 Run `npm test` on Node 24 from the plugin directory; verify exit code 0 and that the suite includes the two new integration tests.
- [x] 5.3 Run `npm run coverage:check` on Node 24; verify exit code 0 and coverage at or above the recorded baseline.
- [x] 5.4 Run `openspec_validate upgrade-openspec-cli-1-16-1`; verify `valid: true` with no errors or warnings.

## Workflow follow-up

- Archive the change with `openspec_archive` after every task is checked.
- Commit the archive, the documentation, the scripts and the merged specs in one commit, then push to `origin/main`.
- Reinstall the bundle or restart DSH, then smoke-test `openspec_list`, `openspec_status`, `openspec_apply_next`, `openspec_mark_task_done` and `openspec_validate` in a live session.
