# Tasks

## 1. Add the missing skill branches

- [x] 1.1 In `skills/openspec-archive-change/SKILL.md`, report an already `archived` state with no pending cleanup as already archived and stop, keeping the existing `repair.action: "cleanup"` branch.
- [x] 1.2 In `skills/openspec-propose/SKILL.md` and `skills/openspec-apply-change/SKILL.md`, tell the agent to follow the returned `nextAction` only when it names another `openspec_review` action after the user approves `waive-reviewer`, and otherwise continue with the skill's own step: present the proposal in propose, go to Finish in apply, and never call `openspec_apply_next` from a waiver result.

## 2. Guard the text

- [x] 2.1 Add a test to `test/skills.test.mjs` asserting the `already archived` phrase, the refusal to call `openspec_archive` or land again, the scoped `nextAction` sentence and `approvedBy: "user"` in each review skill.
- [x] 2.2 Confirm the new assertions fail once the sentences are removed.

## 3. Verify

- [x] 3.1 Run `node --test test/skills.test.mjs`.
- [x] 3.2 Run `openspec validate fix-skill-missing-branches --strict`, `npm run openspec:check`, `npm run check:pr`, `npm run layout:check` and `npm run verify`.
