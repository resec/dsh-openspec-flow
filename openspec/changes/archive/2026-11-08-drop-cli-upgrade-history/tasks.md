# Tasks

## 1. Remove the upgrade record

- [x] 1.1 Delete the `## 版本对照：1.16.0 到 1.16.1` section of `docs/upgrading-openspec-cli.md`, including its scope line, upstream facts, pre-upgrade checks, edit inventory and measured behavior; verify `grep -n "版本对照" docs/upgrading-openspec-cli.md` returns nothing and `## 验收清单` is followed by `## 来源`.
- [x] 1.2 Delete the dated `1.16.0`/`1.16.1` contract-check result from `### 输出解读`, including the result block and its interpretation paragraph; verify the section ends with the output-mark bullets and `grep -n "1.16.0" docs/upgrading-openspec-cli.md` returns nothing.

## 2. Make examples version-neutral

- [x] 2.1 Rewrite the Breaking and behavior-change bullets under `### 读取上游变更` so they name the inputs and the kinds of change without a past version's case; verify both bullets remain and `grep -n "1.16.1 让" docs/upgrading-openspec-cli.md` returns nothing.
- [x] 2.2 Change the unknown-delta-section negative check to state the current pin's behavior; verify `grep -n "1.16.1 起" docs/upgrading-openspec-cli.md` returns nothing and the check still names `validate`, `archive` and the write-path guard.
- [x] 2.3 Replace both `--candidate 1.16.1` examples under `### 用法` with `--candidate <version>`; verify `grep -n -- "--candidate 1.16.1" docs/upgrading-openspec-cli.md` returns nothing and the usage block still shows the npm and offline forms.
- [x] 2.4 Point the upstream sources at the Releases index instead of the v1.16.1 and v1.16.0 tags; verify both tag links are gone, the CHANGELOG and npm registry entries remain, and the Releases URL responds.

## 3. Verify the guide

- [x] 3.1 Run `openspec_validate drop-cli-upgrade-history`; verify the result reports `valid: true` with no errors.
- [x] 3.2 Read `docs/upgrading-openspec-cli.md` end to end; verify `grep -n '^## '` lists the procedure headings in order, the current-pin baseline and the CLI coupling inventory are intact, and no sentence describes a completed upgrade's changes or measurements.
- [x] 3.3 Run `npm test` and `npm run coverage:check` on Node 24; verify both exit zero.

## Workflow follow-up

- Archive the change only when the user asks.
- After archiving, commit the archive, the documentation update and the merged specs in one commit, then push to `origin/main`.
