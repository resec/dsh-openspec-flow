# Tasks

## 1. Add the missing skill branches

- [x] 1.1 In `skills/openspec-archive-change/SKILL.md`, report an already `archived` state with no pending cleanup as already archived and stop, keeping the existing `repair.action: "cleanup"` branch.
- [x] 1.2 In `skills/openspec-propose/SKILL.md` and `skills/openspec-apply-change/SKILL.md`, tell the agent to continue with the returned `nextAction` after the user approves `waive-reviewer`.

## 2. Guard the text

- [x] 2.1 Add a test to `test/skills.test.mjs` asserting the `already archived` phrase and the continue-after-waiver sentence in each skill.
- [x] 2.2 Confirm the new assertions fail once the sentences are removed.

## 3. Verify

- [x] 3.1 Run `node --test test/skills.test.mjs`.
- [x] 3.2 Run `openspec validate fix-skill-missing-branches --strict`, `npm run openspec:check`, `npm run check:pr`, `npm run layout:check` and `npm run verify`.
