# Tasks: Complete OpenSpec toolset and skill adaptation

## 1. Baseline

- [x] 1.1 Confirm a clean git tree and 44 passing tests before edits

## 2. Query tools

- [x] 2.1 Split `lib/tools.js` into `lib/tools/query.js`, `lib/tools/apply.js`, `lib/tools/write.js` and `lib/tools/index.js` without changing existing tool behavior
- [x] 2.2 Extend `openspec_list` with a `specs` mode
- [x] 2.3 Extend `openspec_validate` with `scope` and `strict`
- [x] 2.4 Add `openspec_instructions` for proposal, specs, design, tasks and archive
- [x] 2.5 Add `openspec_show` for change and spec, with `noScenarios`
- [x] 2.6 Add `openspec_context`, `openspec_schemas` and `openspec_store_list`
- [x] 2.7 Add query-tool unit and real-CLI integration tests

## 3. Write tools

- [x] 3.1 Add `openspec_new_change`
- [x] 3.2 Add `openspec_archive` with validate-before-archive and `skipSpecs`
- [x] 3.3 Add write-tool tests for success, validation failure and unwritable targets

## 4. Init and skills

- [x] 4.1 Add `lib/skills.js` for skill document parsing, hashing, `generatedBy` classification and backup
- [x] 4.2 Add `lib/init.js` running `init --tools none` and writing six plugin skills
- [x] 4.3 Implement migration, conflict reporting and idempotent rewrites
- [x] 4.4 Add init and migration tests covering empty projects, existing projects, official skills and user-authored skills

## 5. Skill text

- [x] 5.1 Write `skills/openspec-explore/SKILL.md`
- [x] 5.2 Write `skills/openspec-propose/SKILL.md`
- [x] 5.3 Write `skills/openspec-apply-change/SKILL.md`
- [x] 5.4 Write `skills/openspec-archive-change/SKILL.md`
- [x] 5.5 Write `skills/openspec-sync-specs/SKILL.md`
- [x] 5.6 Write `skills/openspec-update-change/SKILL.md`
- [x] 5.7 Map CLI fragments in `openspec_instructions` output and assert no command fragment remains
- [x] 5.8 Update the `openspec-flow` index, `lib/policy.js`, README, AGENTS and locale text

## 6. Verification

- [x] 6.1 Run the full tool workflow end to end on a temporary fixture
- [x] 6.2 Compare tool output against the CLI run: `tasks.md`, archived specs and validation results
- [x] 6.3 Run `openspec_validate` and `node --test test/` and report results
