# Tasks

## 1. Dependency and lockfile

- [ ] 1.1 Move the `@fission-ai/openspec` dependency to `2.0.0` and the plugin version to `0.6.0` in `package.json`; verify `node -e "const p=require('./package.json'); console.log(p.dependencies['@fission-ai/openspec'], p.version)"` prints `2.0.0 0.6.0`.
- [ ] 1.2 Record the target release's declared Node floor the guide will state; verify `npm_config_cache=<temp dir> npm view @fission-ai/openspec@2.0.0 engines.node --json` prints `[">=22.12.0"]`, matching `design.md`'s Context and staying below `package.json`'s `engines.node`.
- [ ] 1.3 Install the new dependency and let npm rewrite the lockfile; verify `node -e "console.log(require('./node_modules/@fission-ai/openspec/package.json').version)"` prints `2.0.0` and `git diff package-lock.json` changes only the plugin version and the `@fission-ai/openspec` entries.
- [ ] 1.4 Confirm the installed CLI still satisfies the version gate; verify `node node_modules/@fission-ai/openspec/bin/openspec.js version --json` prints `"version": "2.0.0"` and `"schemaVersion": 1`.

## 2. Task parser

- [ ] 2.1 Add the regression cases to `test/tasks.test.mjs` — a wrapped task, a trailing hard break, a sibling checkbox, a plain list item that only ends the text, an empty checkbox that takes its continuation line, and an unchanged count — and run them against the current first-line-only parser; verify they fail, and record the observed descriptions.
- [ ] 2.2 Port 2.0.0's paragraph-break and hard-break rules into `lib/tasks.js`, keeping the upstream pattern alternatives verbatim; verify `node --test test/tasks.test.mjs` passes and the cases from 2.1 now produce the joined descriptions.
- [ ] 2.3 Update the module comment so it names 2.0.0 and the joined-paragraph rule; verify `grep -n "2.0.0" lib/tasks.js` names the mirrored version and `grep -n "1.16.1" lib/tasks.js` returns nothing.
- [ ] 2.4 Add an integration case to `test/integration.test.mjs` that writes a wrapped numbered task, a wrapped unnumbered task, a trailing hard break and a sibling bullet, then runs `openspec_apply_next` against the real bundled CLI and asserts the plugin's description for that `sourcePath` and `line` equals the CLI's `tasks[].description`, and a `openspec_mark_task_done` with that hint flips only the intended line; verify the case fails when `lib/tasks.js` is temporarily restored to the first-line-only rule and passes with 2.2 in place.

## 3. Version assertions and packaged skills

- [ ] 3.1 Move both `1.16.1` literals in `test/openspec.test.mjs` — the pinned-version assertion and the expected mismatch message — to `2.0.0`; verify `node --test test/openspec.test.mjs` passes and `grep -rn "1\.16\.1" test/openspec.test.mjs` returns nothing.
- [ ] 3.2 Move `metadata.upstream` to `openspec@2.0.0` and `metadata.generatedBy` to `dsh-openspec-flow@0.6.0` in the five `skills/*/SKILL.md`; verify `node --test test/skills.test.mjs` passes.
- [ ] 3.3 Rewrite the apply skill's verify step so it compares the checkbox's whole paragraph at `next.sourcePath` and `next.line` with `next.description` instead of the single line; verify the paragraph wording is present and a single-line comparison sentence is gone.
- [ ] 3.4 Move the upstream assertion in `test/skills.test.mjs` to `openspec@2.0.0` and add an assertion for the 3.3 wording; verify `node --test test/skills.test.mjs` passes and `grep -rn "openspec@1.16.1" skills/ test/` returns nothing.

## 4. Documentation

- [ ] 4.1 Move the guide baseline in `docs/upgrading-openspec-cli.md` — CLI `2.0.0`, plugin `0.6.0`, the CLI's declared Node floor — and every pin reference and coupling row with it, including the second `1.16.1` literal in `test/openspec.test.mjs`; verify `grep -n "1\.16\.1\|0\.5\.0" docs/upgrading-openspec-cli.md` returns nothing and every cited line still points at the named code.
- [ ] 4.2 Move the CLI pin in the baseline block of `docs/upgrading-dsh-runtime.md` to `2.0.0`; verify `grep -n "1\.16\.1" docs/upgrading-dsh-runtime.md` returns nothing.
- [ ] 4.3 Repoint both README tag tables to `v2.0.0` and re-verify their contents against the installed CLI help and the pinned skills reference; verify the CLI table still has 22 command rows and the skills table still has 12 rows, each matching the installed CLI and the v2.0.0 reference.
- [ ] 4.4 Move the two README tag tables, the version descriptions at lines 183, 184, 216, 287 and 289, and the test-suite sentence at line 238 to `2.0.0`; leave the measurement-environment line 233 and the tool-side figures attributed to `1.16.1`, and add one sentence with the 2.0.0 re-measurement of the `instructions apply` byte count over a named 39-task fixture — a scratch project from `openspec init --tools none`, one change from `openspec new change measure`, a `tasks.md` of 39 single-line tasks `- [ ] N.1 Task N`, measured with `node node_modules/@fission-ai/openspec/bin/openspec.js instructions apply --change measure --json | wc -c`; verify `grep -n "1\.16\.1" README.md` returns only line 233 and the new sentence names the fixture and the measured bytes.
- [ ] 4.5 Move the version strings in `AGENTS.md` and `cordis.patch.yml` to 2.0.0; verify `grep -rn "1\.16\.1" package.json package-lock.json lib/ skills/ test/openspec.test.mjs test/skills.test.mjs test/tasks.test.mjs test/integration.test.mjs AGENTS.md cordis.patch.yml docs/` returns nothing, and that the only remaining occurrences outside `openspec/changes/` are the allowed ones: `README.md:233`, the `parseArgs` fixtures in `test/cli-contract.test.mjs`, and `openspec/specs/project-invariants/spec.md`, whose delta merges at archive.

## 5. Integration checks

- [ ] 5.1 Run the full suite on Node 24; verify `npm test` passes and the integration and e2e tests run against the installed 2.0.0 CLI.
- [ ] 5.2 Run the coverage gate on Node 24; verify `npm run coverage:check` passes without dropping a scope below its baseline.
- [ ] 5.3 Run strict OpenSpec validation over the active change and main specs; verify `npm run openspec:check` exits 0 and `openspec_inspect` with `action: "validate"` and `strict: true` reports the change valid.

## Workflow follow-up

- Repack the bundle with `npm run bundle:pack -- --force`, reinstall the tarball in the Plugins page and restart the session, then smoke-test `openspec_inspect`, `openspec_apply_next` and `openspec_mark_task_done`.
- Archive the change once the apply review is ready, then commit the archive, documentation and merged specs in one commit and push `main` to `origin/main`.
