# Tasks

## 1. Propose skill reads existing specs

- [x] 1.1 Replace the `## Before creating` list in `skills/openspec-propose/SKILL.md` with the agreed text: setup check, capability inventory with `specs: true`, filtered overview with `noScenarios: true`, full read with `type: "spec"`, conflict surfaced, and a confirmation line naming the touched specs. Verify the file contains `specs: true`, `noScenarios: true` and `surface the conflict`.
- [x] 1.2 Add assertions for the propose text to `test/skills.test.mjs` and verify `node --test test/skills.test.mjs` passes on Node 24.
- [x] 1.3 Update the `openspec-propose` row of the official-skill comparison table in `README.md` to describe the spec read and conflict check, and verify the row matches the shipped SKILL.md.

## 2. Explore skill reads relevant specs in full

- [x] 2.1 Replace the two `openspec_show` bullets and the closing read bound in `skills/openspec-explore/SKILL.md` with the agreed text: filtered overview first, then a full read of every relevant spec including scenarios, bounded to what the question needs. Verify the file contains `only an overview` and `read every relevant spec in full`.
- [x] 2.2 Add assertions for the explore text to `test/skills.test.mjs` and verify `node --test test/skills.test.mjs` passes on Node 24.
- [x] 2.3 Update the `openspec-explore` row of the official-skill comparison table in `README.md` to describe the filtered-then-full read, and verify the row matches the shipped SKILL.md.

## 3. Integration checks

- [x] 3.1 Run `npm test` on Node 24 and verify it passes.
- [x] 3.2 Run `npm run coverage:check` and verify it passes.
- [x] 3.3 Run `openspec_validate` with `strict: true` for `align-skill-spec-reads` and verify it is valid.

## Workflow follow-up

- Archive the change only when the user asks.
- After archiving, commit the archive, the documentation updates and the merged specs in one commit, then push to `origin/main`.
