# Tasks

## 1. Dependency and lockfile

- [x] 1.1 Run the JSON contract check before the pin moves, so the baseline is still 2.0.0; verify `npm run contract:check -- --candidate 2.2.0` prints `baseline: 2.0.0` and exits 0 with no `FAIL` line, and record the candidate version it reports.
- [x] 1.2 Move the `@fission-ai/openspec` dependency to `2.2.0` and the plugin version to `0.10.0` in `package.json`; verify `node -e "const p=require('./package.json'); console.log(p.dependencies['@fission-ai/openspec'], p.version)"` prints `2.2.0 0.10.0`.
- [x] 1.3 Install the new dependency with Node 24 and let npm rewrite the lockfile; verify `node -e "console.log(require('./node_modules/@fission-ai/openspec/package.json').version)"` prints `2.2.0` and `node node_modules/@fission-ai/openspec/bin/openspec.js version --json` prints `"version": "2.2.0"` and `"schemaVersion": 1`.
- [x] 1.4 Review the lockfile diff; verify `git diff package-lock.json` changes the root package version and the `@fission-ai/openspec` version, resolved URL and integrity; adds `skills`, `nostics`, `tar` and `tar`'s tree (`chownr`, `minizlib`, `minipass`, `yallist`, `@isaacs/fs-minipass`); moves `chalk` from 5.6.2 to 6.0.1 with a nested 5.6.2 kept under `ora`; and leaves `yaml` at 2.9.1, with any other entry explained.

## 2. Version literals and packaged skills

- [x] 2.1 Move both `2.0.0` literals in `test/openspec.test.mjs` - the pinned-version assertion and the expected mismatch message - to `2.2.0`; verify `node --test test/openspec.test.mjs` passes and `grep -n "2\.0\.0" test/openspec.test.mjs` returns nothing.
- [x] 2.2 Move the three `openspec@2.0.0` assertions in `test/skills.test.mjs` to `openspec@2.2.0`; verify `node --test test/skills.test.mjs` passes and `grep -n "2\.0\.0" test/skills.test.mjs` returns nothing.
- [x] 2.3 Move the root fixture's `dsh-openspec-flow@0.9.0` and `openspec@2.0.0` in `test/check-generated-skills.test.mjs` to the new values, leaving the generated fixture's arbitrary `generatedBy: "2.0.0"` as a format sample; verify `node --test test/check-generated-skills.test.mjs` passes.
- [x] 2.4 Move `metadata.upstream` to `openspec@2.2.0` and `metadata.generatedBy` to `dsh-openspec-flow@0.10.0` in the five `skills/*/SKILL.md`; verify `node --test test/skills.test.mjs` passes and `grep -rn "openspec@2\.0\.0\|dsh-openspec-flow@0\.9\.0" skills/` returns nothing.
- [x] 2.5 Move both mirrored-version comments in `lib/tasks.js` (lines 5 and 36) from 2.0.0 to 2.2.0; verify `grep -n "2\.0\.0" lib/tasks.js` returns nothing and `node --test test/tasks.test.mjs` still passes.
- [x] 2.6 Check the remaining version literals outside the change directory: verify `grep -rn "2\.0\.0" package.json lib/ skills/ test/openspec.test.mjs test/skills.test.mjs test/check-generated-skills.test.mjs AGENTS.md cordis.patch.yml docs/ README.md` returns only the allowed entries (the generated fixture's arbitrary `generatedBy`, the arbitrary-version fixture in `test/lab-cache.test.mjs`, and the main spec merged at archive).

## 3. Documentation

- [x] 3.1 Repoint both README tag tables to `v2.2.0` and move every pin reference in the version descriptions, test-suite sentence and limitations section to `2.2.0`; verify `grep -n "v2\.0\.0" README.md` returns nothing, `grep -n "2\.0\.0" README.md` returns nothing, `grep -n "1\.16\.1" README.md` returns only the measurement-environment line, and the CLI table still has 22 command rows.
- [x] 3.2 Update the README CLI table's `init` row for the `--scope` option, add the 2.2.0 `openspec` router row to the skills table marked as not provided by the plugin, and move the skills-table lead sentence from 12 skills to 13 (the 12 workflow skills plus the always-installed router); verify the lead sentence and the 13 rows agree.
- [x] 3.3 Re-measure the `instructions apply --json` byte count on 2.2.0 over the documented 39-task fixture - a scratch project from `openspec init --tools none`, one change from `openspec new change measure`, a `tasks.md` of 39 single-line tasks `- [ ] N.1 Task N`, measured with `node node_modules/@fission-ai/openspec/bin/openspec.js instructions apply --change measure --json | wc -c` - and update the README verification sentence; verify the written number equals the measured bytes and the sentence names the fixture and the CLI version.
- [x] 3.4 Move the version words in `AGENTS.md` and `cordis.patch.yml` to 2.2.0; verify `grep -n "2\.0\.0" AGENTS.md cordis.patch.yml` returns nothing.
- [x] 3.5 Move `docs/upgrading-openspec-cli.md`'s baseline (CLI 2.2.0, plugin 0.10.0, the CLI's declared Node floor `>=22.20.0`), every pin reference and coupling row, and its acceptance checklist to the new baseline; verify `grep -n "2\.0\.0\|0\.9\.0" docs/upgrading-openspec-cli.md` returns nothing and every cited code line still points at the named code.
- [x] 3.6 Move the CLI pin in the baseline block of `docs/upgrading-dsh-runtime.md` to 2.2.0; verify `grep -n "2\.0\.0" docs/upgrading-dsh-runtime.md` returns nothing.

## 4. Integration checks

- [x] 4.1 Run the full suite and coverage gate on Node 24; verify `npm run verify` exits 0 and reports both the test summary and the coverage verdict.
- [x] 4.2 Run strict OpenSpec validation over the main specs and the change; verify `npm run openspec:check` exits 0 and `openspec_inspect` with `action: "validate"` and `strict: true` reports the change valid.

## Workflow follow-up

- Archive the change after the draft review and the apply review are ready, then commit the archive, the merged `project-invariants` spec and the documentation updates.
- Push `origin/main` and verify the local branch and the remote agree.
- Repack and reinstall the profile bundle only when a release needs the new dependency tree; the runtime code does not change in this upgrade, so a reinstall is not required to complete this change.
