# Tasks

## 1. Contributor commit language

- [ ] 1.1 Append the English commit-message sentence to step 5 of `CONTRIBUTING.md`; verify `git diff -- CONTRIBUTING.md` shows that sentence added to the existing commit paragraph and nothing else.

## 2. Agent commit conventions

- [ ] 2.1 Add to the `Commit conventions` section of `AGENTS.md` the English paragraph, the repository-identity paragraph scoped to a commit created in the working tree and naming the sanctioned repository-configured automation identity, and the no-gate sentence reading "no script, hook or CI check enforces them"; verify `git diff -- AGENTS.md` shows only those three edits, and `grep -n "Commit messages are English" AGENTS.md`, `grep -n "repository identity" AGENTS.md` and `grep -n "no script, hook or CI check" AGENTS.md` each report the new text.
- [ ] 2.2 Read `CONTRIBUTING.md`, `AGENTS.md` and the delta requirement together and confirm the English rule reads the same in all three and the identity rule stays in `AGENTS.md`; verify `npm run check:requirement-length` passes.

## 3. Verification

- [ ] 3.1 Run `openspec_inspect` validate with `strict: true` and `npm run check:requirement-length`; verify neither reports a finding for this change.
- [ ] 3.2 Run `npm run verify` with the recorded Node 24 first on `PATH` and verify the test summary and the coverage verdict both pass.
- [ ] 3.3 Read `git log <base>..HEAD` from the apply base commit and verify each changing group owns a commit carrying only its changes, and group 3 owns none.

## Workflow follow-up

- Land the apply worktree with `approvedBy: "user"` after the apply review is ready.
- Push the archive commit to `origin/main` and verify `origin/main` contains it.
