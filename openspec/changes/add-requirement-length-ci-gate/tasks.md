# Tasks

## 1. Gate script

- [ ] 1.1 Add `scripts/check-requirement-length.mjs` that imports `resolveBundledCli` from `lib/openspec.js` and `classifyRequirementLength` from `lib/review/length.js`, walks non-archive active changes, reads each delta with `openspec show <change> --type change --json` and each existing main spec with `openspec show <spec> --type spec --json`, and applies the classifier; verify `node scripts/check-requirement-length.mjs` exits 0 on the current tree.
- [ ] 1.2 Add the reporting path: a Markdown entries table with the official handling appended to `$GITHUB_STEP_SUMMARY`, an `::error file=<delta path>` annotation on the requirement heading line, stderr output when the summary variable is absent, and exit code 1 for a blocking entry with 2 for usage or CLI failure; verify against a temporary fixture that grows a modified description and observe the exit code, annotation and summary text.
- [ ] 1.3 Add `--change` and `--root` options and a fail-closed path for a missing CLI, a non-JSON projection or an unreadable spec; verify `node scripts/check-requirement-length.mjs --change add-requirement-length-ci-gate --root .` exits 0 and an unknown change name exits 2.

## 2. Tests

- [ ] 2.1 Add `test/check-requirement-length.test.mjs` covering an over-long added description on a direct run, a modified description that grows past its baseline, an unchanged legacy description, a missing main spec, a missing CLI, a malformed non-JSON projection and a bad `--change` name; verify `npm run test:affected -- scripts/check-requirement-length.mjs` passes.
- [ ] 2.2 Assert in the same test file that a blocking run writes the entries and official handling to `GITHUB_STEP_SUMMARY`, emits the delta-file annotation and prints to stderr when the summary variable is absent; verify the assertions fail when the reporting path is removed.
- [ ] 2.3 In the same test file, compare the script's blocking verdict on a fixture with a direct `classifyRequirementLength` call over the same delta and baseline, and assert that the script source imports `classifyRequirementLength` from `lib/review/length.js`; verify both assertions fail when the script stops importing the classifier.
- [ ] 2.4 Extend `test/ci-workflow.test.mjs` to assert the new step runs after `npm run openspec:check` in the verify job; verify the test fails when the step is dropped or reordered.

## 3. Wiring

- [ ] 3.1 Add the `check:requirement-length` script to `package.json`; verify `npm run check:requirement-length` exits 0 on the current tree.
- [ ] 3.2 Add the step to `.github/workflows/ci.yml` after `npm run openspec:check`; verify `npm run test:affected -- .github/workflows/ci.yml` passes and the workflow parses as YAML.

## 4. Documentation

- [ ] 4.1 Document in `docs/pr-review.md` that the length gate runs in pull-request CI, that a failing gate removes the pull request from the watch candidates, and that the plugin preflight remains; verify the section states both paths and names the npm script.
- [ ] 4.2 State the CI gate in `AGENTS.md` next to the existing verification and CI description; verify the sentence names the script and the job it runs in.
- [ ] 4.3 Update `CONTRIBUTING.md`: add the gate to the verify job's step list and name `npm run check:requirement-length` in the local checks; verify both sections name the command.

## 5. Verification

- [ ] 5.1 Run `openspec_inspect` with `action: "validate"` and `strict: true`; verify no error or warning.
- [ ] 5.2 Run `npm run verify` on Node 24; verify the test summary passes and the coverage gate reports success.
- [ ] 5.3 Run the gate against an existing blocked pull-request checkout read-only and confirm it reports the same entry and baseline the plugin refused; verify the output names the delta path and both lengths without writing to the checkout.

## Workflow follow-up

- Archive the change after the review requirements are satisfied.
- Push the landed commits with `node scripts/push-landed.mjs --push`.
- Close and reopen each pull request this gate currently blocks, then verify the new run's step list contains `check:requirement-length`.
