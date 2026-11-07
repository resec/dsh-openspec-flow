# Tasks

## 1. Remove the packaged skill

- [x] 1.1 Delete `skills/openspec-sync-specs/SKILL.md` and the empty directory; verify `ls -d skills/*/` lists exactly `openspec-explore`, `openspec-propose`, `openspec-apply-change`, `openspec-archive-change` and `openspec-update-change`
- [x] 1.2 Remove `'openspec-sync-specs'` from `SKILL_NAMES` in `lib/skills.js` and change the `index.js` header from six skills to five; verify `node -e "import('./lib/skills.js').then(m => console.log(m.SKILL_NAMES.join(',')))"` prints the five names without the removed one

## 2. Policy

- [x] 2.1 Add the no-sync-only rule to `POLICY_TEXT` in `lib/policy.js`, naming `openspec_archive`, forbidding hand edits of `openspec/specs/`, and refusing a stale `openspec-sync-specs` skill; verify the text contains those three clauses
- [x] 2.2 Assert the new rule in `test/policy.test.mjs`; verify `node --test test/policy.test.mjs` passes on Node 24

## 3. Tests

- [x] 3.1 Update `PLUGIN_SKILLS` in `test/integration.test.mjs` to the five names and verify the catalog test compares against exactly five candidates
- [x] 3.2 Add a `test/skills.test.mjs` case asserting `SKILL_NAMES` excludes `openspec-sync-specs` and `packagedSkillPath('openspec-sync-specs')` does not exist; verify `node --test test/skills.test.mjs` passes

## 4. Documentation

- [x] 4.1 Update `README.md`: replace the "部分支持" sync row with an "不支持" row, change six to five in the skills section, limits and file tree, and add the stale-copy instructions to the skills and install sections; verify `grep -n "六份\|sync-specs" README.md` shows only the migration notes and no supported-flow claim
- [x] 4.2 Update `AGENTS.md` from six skills to five and add the sentence that main specs are updated only by `openspec_archive` and `openspec-sync-specs` must not be reintroduced; verify `grep -n "six\|five\|sync" AGENTS.md` shows the new text

## 5. Version

- [x] 5.1 Set `package.json` and the two root `version` fields in `package-lock.json` to `0.2.0`, and update `metadata.generatedBy` in the five remaining skills to `dsh-openspec-flow@0.2.0`; verify `node --test test/skills.test.mjs` passes

## 6. Full verification

- [x] 6.1 Run `openspec_validate remove-sync-specs-skill`, `npm test` and `npm run coverage:check` with Node 24.22.2 on `PATH`; record the three results and fix any failure before archive

## Workflow follow-up

- Archive the change only after all tasks pass, then commit the archive, docs and merged specs in one commit and push to `origin/main`.
- Remove the stale `.dsh/skills/openspec-sync-specs/` copy from `dsh-openspec-flow-eval` and reload the linked plugin in the `web` profile.
