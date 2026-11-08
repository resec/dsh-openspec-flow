# Tasks

## 1. Projection

- [x] 1.1 Add optional `context` and `rules` to the artifact branch of `projectInstructions`, omitting empty values; verify with a unit test in `test/projections.test.mjs` that configured values survive and empty values are absent.
- [x] 1.2 Add the archive branch to `projectInstructions`: return `{ change, artifact: "archive", context?, guidance?, root? }` and no artifact fields; verify with a unit test that the operation shape is returned for an archive payload.
- [x] 1.3 Add optional `context` and `guidance` to `projectApply`, reading `payload.context` and `payload.operationGuidance`; verify with a unit test in `test/state-projections.test.mjs` for present and absent values.

## 2. Tool results

- [x] 2.1 Extend the `openspec_instructions` output schema to `oneOf` artifact and archive shapes, with descriptions for `context`, `rules` and `guidance`; verify the tool registers and the description scan passes in `test/descriptions.test.mjs`.
- [x] 2.2 Extend the `openspec_apply_next` output schema and description with optional `context` and `guidance`; verify the tool still registers and the description scan passes.
- [x] 2.3 Record the new instruction read fields and the archive instructions command in `scripts/cli-contract.json`, and update the command count in `test/cli-contract.test.mjs`; verify `node --test test/cli-contract.test.mjs` passes.

## 3. Skills and documentation

- [x] 3.1 Add the archive-inputs step to `skills/openspec-archive-change/SKILL.md`, calling `openspec_instructions` with `artifact: "archive"` before archiving; verify the skill test passes and the text names no command.
- [x] 3.2 Update `skills/openspec-propose/SKILL.md`, `skills/openspec-update-change/SKILL.md` and `skills/openspec-apply-change/SKILL.md` to follow the returned `context`, `rules` and `guidance`; verify the skill test passes.
- [x] 3.3 Update the `README.md` tool table, archive flow row and CLI comparison row, and add a note that `openspec/config.yaml` context, rules and operation guidance are returned by the tools only when configured; verify the rows mention the new fields with `grep`.

## 4. Integration

- [x] 4.1 Add an integration test that writes `context`, `rules.proposal` and `operations.apply|archive.guidance` into the fixture's `openspec/config.yaml`, then asserts the artifact, archive and apply results carry them; verify with `node --test test/integration.test.mjs` on Node 24.
- [x] 4.2 Add an integration assertion that a config without those sections yields no `context`, `rules` or `guidance` fields; verify with the same test file.
- [x] 4.3 Run `openspec_validate surface-project-guidance`, `npm test` and `npm run coverage:check` on Node 24; verify all pass and the change has no unchecked tasks.
