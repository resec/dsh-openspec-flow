# Tasks

## 1. Landing candidates and review failure recording

- [ ] 1.1 Add the read-only `candidates` command to `scripts/pr-review-land.mjs`, including the exported listing function, `parseArgs` handling and usage text; verify `node scripts/pr-review-land.mjs candidates` reports the labeled, commented pull requests and leaves `state.json` and `landings.json` unchanged.
- [ ] 1.2 Run `planLanding` and `assertSingleLanding` for each row and report the first refusal reason; verify the test matrix covers a missing label, an uncommented watch entry, a moved head, an unfinished landing of another pull request, a dirty main worktree reported once and a read-only run.
- [ ] 1.3 Add the `review-failed` landing phase and a `state --fail <n> --error <text> --apply` command that records the phase and error while keeping the checkout; verify the phase is abandonable, `candidates` omits a pull request in that phase with its refusal reason, and the abandon-then-candidates sequence re-admits the pull request.
- [ ] 1.4 Run `npm run test:affected -- scripts/pr-review-land.mjs test/pr-review-land.test.mjs`; verify it passes.

## 2. Fixed-session documentation

- [ ] 2.1 Rewrite the Commands and Schedule sections of `docs/pr-review.md` for the fixed five-minute session, one phase per run, the `candidates` command and `state --fail`; verify the documented commands match the implemented commands.
- [ ] 2.2 State in the Landing and State sections that the final review resumes the recorded apply review in the same session, that a failed resume records `review-failed` through `state --fail`, and the four operator recovery steps: a user-approved `openspec_review action=replace review=apply` with a reason, removing the locked review record and starting a fresh review before `abandon`, a user-approved `openspec_review action=dispose review=apply` for an open finding, or the maintainer removing the `mergeable` label; verify `node --test test/pr-review-land.test.mjs` passes with an updated documentation assertion.
- [ ] 2.3 Update the scheduled-session paragraph in `AGENTS.md` to the fixed session; verify `node --test test/contributor-docs.test.mjs` passes.

## 3. Prompt and integration

- [ ] 3.1 Update the scheduled task prompt to the fixed-session flow, including the rule that a `prepared` landing with no review record starts the final review and one with a review record checks it; confirm the five-minute recurrence and the existing target session; verify `schedule_list` shows the new prompt and still one PR schedule.
- [ ] 3.2 Commit the implementation, run `npm run verify` on Node 24 and record the result; verify the run passes.
- [ ] 3.3 Run `openspec_inspect action=validate strict=true`; verify it reports no findings.

## Workflow follow-up

- Run the apply review after the implementation commit and fix every blocker.
- Archive the change after the apply review is ready, commit the archive and merged specs, and push `main` to `origin`.
