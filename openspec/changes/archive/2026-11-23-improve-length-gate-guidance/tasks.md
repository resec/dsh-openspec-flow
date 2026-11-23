# Tasks

## 1. Report content

- [x] 1.1 Implement `renderReport(rows, locations, limit)` that renders a rationale sentence using `limit`, the entries table, the `Official handling:` block, an `Edit:` list and a `Verify:` line; verify a direct render call returns text containing the limit number, `Official handling:`, `Edit:` and `Verify:` with the delta path.
- [x] 1.2 Pass the classifier's `limit` into `reportBlockers`, which builds the rows and locations and calls `renderReport`, then writes the text to standard output and appends it plus its trailing newline to `$GITHUB_STEP_SUMMARY` when set; verify a fixture run prints the report on stdout and writes the identical text to a temporary summary file.

## 2. Tests

- [x] 2.1 Update `test/check-requirement-length.test.mjs` so the local run asserts the report on stdout instead of stderr; verify `node --test test/check-requirement-length.test.mjs` passes.
- [x] 2.2 Assert the report states the limit rationale, names the blocking entry, the official handling, the delta file with its requirement line and `npm run check:requirement-length`; verify the assertion fails when any one of those is removed.
- [x] 2.3 Assert the summary file equals the rendered report plus the trailing newline; verify a change that writes only the summary fails the log assertion and a change that drops the summary append fails the summary assertion.
- [x] 2.4 Assert a passing run prints only the passing line; verify the passing path contains no rationale, table or command.
- [x] 2.5 Assert that a delta file without a matching requirement heading yields an `Edit:` entry naming the file without a line; verify the fallback branch is covered.

## 3. Documentation

- [x] 3.1 Document in `docs/pr-review.md` where a blocked author sees the report: the job log and the job summary, both naming the entry, the handling, the edit location and the local command; verify the section names both sinks and the command.

## 4. Verification

- [x] 4.1 Run `openspec_inspect` with `action: "validate"` and `strict: true`; verify no error or warning.
- [x] 4.2 Run `npm run verify` on Node 24; verify the test summary passes and the coverage gate reports success.

## Workflow follow-up

- Archive the change after the review requirements are satisfied.
- Push the landed commits with `node scripts/push-landed.mjs --push`.
- Reopen the blocked pull requests once more and confirm the new report appears in the failed step's log.
