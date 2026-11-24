# Tasks

## 1. Guard the returned context and rules

- [x] 1.1 In `test/skills.test.mjs`, assert that the propose and update skills name `context` and `rules` in the paragraph that names the `instructions` result of `openspec_inspect`.
- [x] 1.2 Assert that the apply skill names `context` and `guidance` in the paragraph that names `openspec_apply_next`.

## 2. Guard the archive inputs

- [x] 2.1 Assert that the archive skill names `context` and `guidance` where it reads `artifact: "archive"`, that it continues when both are absent, and that the read comes before `openspec_archive`.

## 3. Confirm each guard fails without its sentence

- [x] 3.1 Delete the apply guidance sentence and run `node --test test/skills.test.mjs`; the new apply case fails.
- [x] 3.2 Restore the skill and repeat for the propose sentence, the update clause and the archive bullet; each new case fails.
- [x] 3.3 Move the archive instructions bullet after the archive call; the ordering assertion fails.
- [x] 3.4 Confirm the existing skill-documentation guard for no CLI and no bare command still passes.

## 4. Verify

- [x] 4.1 Run `node --test test/skills.test.mjs` on Node 24.
- [x] 4.2 Run `npm run verify`: 1448 tests pass, plugin coverage line 98.60%, branch 93.70%, function 99.21%, new code `n/a`.
- [x] 4.3 Run `npx openspec validate test-skill-guidance --strict`, `npm run openspec:check` and `node scripts/check-pr-change.mjs --base origin/main`.
