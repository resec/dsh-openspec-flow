# Tasks

## 1. Flow guidance and agent instructions

- [x] 1.1 Replace the commented `operations` example in `openspec/config.yaml` with a real `operations.apply.guidance` entry that states the group rule: a numbered group's commit carries only that group's changes, the subtasks of one group may share it, and a verification-only group leaves none; keep `schema: spec-driven`. Verify `./node_modules/.bin/openspec instructions apply --change task-group-commit-convention --json` returns the rule under `operationGuidance`.
- [x] 1.2 Add the rule to the `Commit conventions` section of `AGENTS.md`: each numbered `tasks.md` group that changes files owns a commit carrying only its changes, no commit combines two groups, a group may take several commits, the subtasks of one group may share one, a verification-only group leaves none, the rule covers implementation before the first apply review, an apply review round keeps one finding per commit, a commit is attributed by the files its group's subtasks name and its message names the group when two groups change one file, and no script or CI check enforces it. Verify `git diff -- AGENTS.md` shows only that section's addition.
- [x] 1.3 Split the existing `git log <base>..HEAD` sentence in `AGENTS.md`: the first apply review checks that every changing group owns a commit, while resuming a round and land check each commit made since the round's reviewed base and exempt the implementation group commits; state the correction for a group without its own commit, which is committing the group's remaining files or splitting the apply branch before the review opens. Verify reading the section shows the checks without contradiction.

## 2. Contributor document

- [x] 2.1 Add the convention to `CONTRIBUTING.md` in `Change-first workflow` step 5: each numbered group that changes files gets its own commit carrying only its changes, the subtasks of one group may share it, a group that only runs checks leaves none, and no CI check enforces it. Verify `git diff -- CONTRIBUTING.md` shows only that step's addition.
- [x] 2.2 Read `CONTRIBUTING.md`, `AGENTS.md` and the `openspec/config.yaml` guidance together and confirm they do not contradict each other; verify `npm run check:requirement-length` passes.

## 3. Verification

- [x] 3.1 Run `npm run openspec:check` with Node 24 on `PATH`; verify strict validation of every active change and main spec passes.
- [x] 3.2 Run `npm run verify` with Node 24 on `PATH`; verify it exits zero and reports the test summary and the coverage verdict.
- [x] 3.3 Run `openspec_inspect` with `action: "validate"` and `strict: true` for this change; verify it reports no findings.
- [x] 3.4 Read `git log <base>..HEAD` from the apply base commit; verify each changing group owns a commit carrying only its changes and group 3 owns none.

## Workflow follow-up

- Run the apply review on the committed worktree and answer every finding with its own commit.
- Land and archive only on the user's explicit request, then push the landed commits when the user asks.
