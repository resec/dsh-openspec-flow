# Tasks

## 1. CLI coverage table

- [x] 1.1 Add `## CLI 对照` to `README.md` with one row per non-deprecated top-level command (22 rows), the covering tool or “不支持”, the exposed and omitted options, and a lead sentence citing the tag-pinned v1.16.0 CLI reference. Verify by running `node node_modules/@fission-ai/openspec/bin/openspec.js --help` and confirming every listed command has exactly one row.
- [x] 1.2 Verify each “部分支持” row against the tool's input schema in `lib/tools/` (for example `openspec_list` exposes only `specs` and `store`) and each “不支持” row against the absence of a registration in `lib/tools/index.js`; confirm no row claims an option the tool passes or omits incorrectly.
- [x] 1.3 Shrink `## 流程覆盖` to the five agent workflows (explore, propose, apply, update, archive) and delete its initialize, store, custom-schema, global-command and sync rows. Verify by counting the table rows and confirming each removed fact now appears in the CLI or skill table.

## 2. Official skill table

- [x] 2.1 Add `## 官方技能对照` with all 12 official skills (Core 6, Optional 6), their type, the plugin handling, and a lead sentence citing the tag-pinned v1.16.0 skills reference. Verify the count and names against the documentation table and confirm the five “提供，已重写” rows match `lib/skills.js`'s `SKILL_NAMES`.
- [x] 2.2 Delete the standalone `openspec-sync-specs` paragraph from `## 技能与初始化` and drop the `限制` bullets that restate command-level or skill-level support. Verify with `grep -n "sync-specs\|13 个\|全局管理" README.md` that each remaining occurrence is a single statement in the table or the migration note.

## 3. Verification

- [x] 3.1 Run `openspec_validate document-cli-skill-coverage` and confirm it reports the change as valid with no findings.
- [x] 3.2 Run `npm test` and `npm run coverage:check` on the primary Node 24 and confirm both exit 0; the change touches only `README.md`, so any failure indicates a pre-existing problem.

## 4. Pin citations to the v1.16.0 tag

- [x] 4.1 Repoint both table citations in `README.md` to `https://github.com/Fission-AI/OpenSpec/blob/v1.16.0/docs-lab/reference/cli.md` and `.../skills.md`, and drop the fetch dates because the tag already pins the version. Verify `grep -nE "openspec\\.dev/docs|2026-11-08" README.md` returns nothing and both URLs answer HTTP 200.
- [x] 4.2 Update `proposal.md`'s source list, `design.md`'s citation decision, and the two earlier task descriptions above to the same tag-pinned URLs, stating that the tag matches the bundled CLI version. Verify `grep -n "openspec.dev/docs" README.md openspec/changes/document-cli-skill-coverage/proposal.md openspec/changes/document-cli-skill-coverage/design.md` returns nothing and `openspec_validate` passes.

## Workflow follow-up

- Archive the change only after the user asks.
