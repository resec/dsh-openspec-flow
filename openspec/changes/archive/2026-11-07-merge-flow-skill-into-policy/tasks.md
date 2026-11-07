# Tasks

## 1. Remove the skill and its loader

- [x] 1.1 Delete `skills/openspec-flow/SKILL.md` and the empty directory; verify `ls -d skills/*/` lists exactly `openspec-explore`, `openspec-propose`, `openspec-apply-change`, `openspec-archive-change`, `openspec-sync-specs`, `openspec-update-change`
- [x] 1.2 Make the provider iterate `SKILL_NAMES`, delete `PACKAGED_SKILL_NAMES` and `loadSkillDocument`, and correct the header comments in `lib/skill.js` and `index.js`; verify `node --input-type=module -e "const { createSkillProvider } = await import('./lib/skill.js'); const names = (await createSkillProvider().list()).map((c) => c.name); if (names.length !== 6 || names.includes('openspec-flow')) process.exit(1); console.log(names.join(','))"` prints six names
- [x] 1.3 Update `test/skill.test.mjs`: remove the `loadSkillDocument` import and its document test, use `SKILL_NAMES` from `lib/skills.js`, and resolve the name-only lookup through `openspec-apply-change`; verify `node --test test/skill.test.mjs` passes on Node 24

## 2. Update the integration expectation

- [x] 2.1 Assert the six-skill catalog and load `openspec-apply-change` in `test/integration.test.mjs`; verify `node --test test/integration.test.mjs` passes on Node 24

## 3. Align the documentation

- [x] 3.1 Update `README.md` (skills section, bootstrapping apply entry, file tree, limits) and verify the edited sections name six skills and no `/openspec-flow` command
- [x] 3.2 Update `AGENTS.md` (apply step and provider sentence) and verify `grep -n '/openspec-flow' AGENTS.md` prints nothing

## 4. Verify the change

- [x] 4.1 Run `openspec_validate merge-flow-skill-into-policy` and confirm `valid: true`
- [x] 4.2 Run `npm test` on Node 24 and confirm the suite passes
- [x] 4.3 Run `npm run coverage:check` on Node 24 and confirm the gate passes

## Workflow follow-up

- Archive with `openspec_archive` only after the user asks.
- After archiving, commit the archive, the documentation updates, and the merged specs in one commit, then push to `origin/main`.
