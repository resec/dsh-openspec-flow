# Tasks

## 1. Bootstrap library

- [ ] 1.1 Write failing tests in `test/bootstrap.test.mjs` for host runtime selection from `PATH` and global candidate directories, the baseline Node version read from `coverage.baseline.json`, the fallback asset name and URL, checksum parsing and unsupported-platform rejection; verify `npm test` fails on the new tests before the implementation exists (raw `node --test` is only an inner-loop aid).
- [ ] 1.2 Implement `scripts/bootstrap-lib.mjs`, including `readBaselineNodeVersion`, to satisfy those tests; verify `npm test` passes.

## 2. Bootstrap entrypoints

- [ ] 2.1 Add `scripts/bootstrap.sh` as a POSIX sh entrypoint that detects platform and architecture, resolves a qualifying host Node 24, reads the fallback version from `coverage.baseline.json`, downloads and verifies that baseline fallback into `.cache/toolchain`, and execs `scripts/bootstrap.mjs`; expose `--print-node-version` and add a `test/bootstrap.test.mjs` case that compares its output with `coverage.baseline.json`. Verify `sh -n scripts/bootstrap.sh`, `./scripts/bootstrap.sh --help` prints usage without downloading anything, and `./scripts/bootstrap.sh --print-node-version` prints the baseline version.
- [ ] 2.2 Add `scripts/bootstrap.mjs` with the runtime preflight, disk check, `npm ci`, hooks installation, Chromium installation with `PLAYWRIGHT_BROWSERS_PATH=.cache/lab/pw-browsers`, lab doctor, `npm test` and the `--full` verify-and-lab path; a missing doctor prerequisite SHALL exit with the doctor's correction-oriented message instead of claiming a pass. Verify `node --check scripts/bootstrap.mjs`, `node scripts/bootstrap.mjs --help` exits without side effects, and the planned steps contain no `openspec init` or `openspec update`.
- [ ] 2.3 Add `scripts/activate.sh`; verify `sh -n scripts/activate.sh`, and verify that after `source` with a local toolchain `node --version` prints the pinned baseline version, while an absent toolchain prints the bootstrap instruction.
- [ ] 2.4 Add the environment and bootstrap sections to `CONTRIBUTING.md` in English, including the browser path, the Linux CJK font prerequisite, and the statement that bootstrap installs no host packages; verify every documented command exists in the scripts and `sh -n` passes for both shell entrypoints.

## 3. Change and skill checks

- [ ] 3.1 Write failing tests in `test/check-pr-change.test.mjs` and `test/check-generated-skills.test.mjs` covering active change selection, unchecked tasks, absolute restricted-path rejection, generated skill paths, generated frontmatter, the root-skill exception and unrelated files; verify `npm test` fails before implementation.
- [ ] 3.2 Implement `scripts/check-pr-change.mjs` with pure predicates and a CLI mode; restricted paths are rejected without an approval input. Verify `npm test` passes.
- [ ] 3.3 Implement `scripts/check-generated-skills.mjs` with pure predicates and a CLI mode; verify `npm test` passes.
- [ ] 3.4 Add `layout:check` and `check:pr` npm scripts in `package.json`; verify `npm run layout:check` passes on the clean tree and fails when a temporary generated skill file is added, then remove the temporary file.
- [ ] 3.5 Add the restricted-path, generated-skill and evidence rules to `CONTRIBUTING.md`; verify each rule matches the checks and the pull request template, and that no approval input is documented for restricted paths.

## 4. Ignore rules

- [ ] 4.1 Update `.gitignore` with the generated skill and command patterns while keeping the repository's root `skills/`; verify `git check-ignore -v` ignores `.dsh/skills/openspec-propose/SKILL.md` and does not ignore `skills/openspec-propose/SKILL.md`.
- [ ] 4.2 Add `test/repo-layout.test.mjs` that asserts `git ls-files` contains no generated skill path and does contain the root skills; verify `npm test` passes on the clean tree and fails against a temporary tracked fixture, then revert the fixture.
- [ ] 4.3 Add the local installation guidance to `CONTRIBUTING.md`; verify it states that local use is allowed and committed generated copies are rejected.

## 5. CI

- [ ] 5.1 Add `.github/workflows/ci.yml` with the Ubuntu `verify` job: checkout with full history, a step that reads the Node version from `coverage.baseline.json`, `setup-node` from that output, `npm ci`, the change and generated-skill checks, `npm run openspec:check` and `npm run verify`. Add `test/ci-workflow.test.mjs` for the two-job shape and the baseline-derived Node version; verify `npm test`, the YAML parses with `python3 -c 'import yaml, sys; yaml.safe_load(open(sys.argv[1]))' .github/workflows/ci.yml`, and the job contains the required steps.
- [ ] 5.2 Add the Ubuntu `lab` job with a baseline-derived `setup-node` step, `PLAYWRIGHT_BROWSERS_PATH=.cache/lab/pw-browsers` for the Chromium install and lab commands, `npx playwright install --with-deps chromium`, the CJK font package, browser and DSH caches, `npm run lab -- doctor` and `npm run test:lab -- --mock-only`, under read-only permissions and a `pull_request` trigger. Extend `test/ci-workflow.test.mjs` so both jobs derive Node from `coverage.baseline.json` and the lab install uses the cached browser path; verify `npm test` and the YAML parse, and that the job contains the required commands.
- [ ] 5.3 Add the CI and evidence sections to `CONTRIBUTING.md`; verify the documented commands match the workflow and the pull request template.

## 6. Templates

- [ ] 6.1 Add `.github/ISSUE_TEMPLATE/bug.md` and `.github/ISSUE_TEMPLATE/task.md` with reproduction, acceptance commands, scope and evidence; verify the files are valid Markdown and link to `CONTRIBUTING.md`.
- [ ] 6.2 Add `.github/PULL_REQUEST_TEMPLATE.md` with the change name, linked issue, root cause, evidence, risk, rollback and checklist; verify every checklist item maps to a CI gate or a maintainer gate, including the absolute restricted-path rule.
- [ ] 6.3 Add `.github/CODEOWNERS` for `.github/`, `.githooks/` and `coverage.baseline.json`, listing `@resec`; verify each pattern names an existing path and the handle resolves to the repository owner.
- [ ] 6.4 Add the review, merge and security sections to `CONTRIBUTING.md`; verify the flow matches the `development-workflow` delta, including merge before archive and the apply review before archive.

## 7. Pointers and integration

- [ ] 7.1 Update `AGENTS.md` so the PATH-only runtime rule is scoped to test and coverage entrypoints and names bootstrap as the single read-only exception, then add bootstrap and contribution pointers to `README.md` and `AGENTS.md`; verify both links resolve and no workflow prose is duplicated from `CONTRIBUTING.md`.
- [ ] 7.2 Run `npm test`, `sh -n scripts/bootstrap.sh`, `sh -n scripts/activate.sh`, `git check-ignore -v` for both skill paths, and a Node pin check that compares `./scripts/bootstrap.sh --print-node-version` with `coverage.baseline.json` and compares the workflow's setup-node steps with the same file; verify all pass.
- [ ] 7.3 Run `npm run openspec:check`, `npm run verify` on the baseline Node version, and `npm run test:lab -- --mock-only`; verify all pass and record the coverage percentages.
- [ ] 7.4 Run `./scripts/bootstrap.sh --full` with a qualifying host Node; verify dependencies, hooks, Chromium, doctor, tests, verification and lab complete, `git status --porcelain` is empty afterwards, shell rc files and global Git configuration match a pre-run snapshot, and neither bootstrap script contains `openspec init` or `openspec update`.
- [ ] 7.5 Exercise the maintainer handoff on a scratch CLI-created change: create it with the CLI, run `openspec_review start draft`, verify the policy is written and the review accepts, then remove the scratch change and its review record.
- [ ] 7.6 Exercise the download path with no qualifying host Node and verify the checksum, extraction and activation produce the baseline Node version; record that macOS remains the first external contributor's acceptance run.

## Workflow follow-up

- Archive the change after the apply review is ready and the user requests it.
- Verify the archived spec merge and push the archive commit.
