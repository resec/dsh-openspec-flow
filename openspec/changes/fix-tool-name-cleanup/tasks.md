# Tasks

## 1. Rename the tools in the specs

- [x] 1.1 Replace `openspec_status` / `openspec_validate` in the schema-compatibility delta.
- [x] 1.2 Replace them in the development-workflow delta.
- [x] 1.3 Replace `openspec_validate` in the flow-policy delta.

## 2. Clean the description and guard it

- [x] 2.1 Describe `strict` without naming a command.
- [x] 2.2 Add a description test that rejects an `openspec <verb>` command name.
- [x] 2.3 Confirm the test fails against the previous description.

## 3. Verify

- [x] 3.1 Run `openspec validate fix-tool-name-cleanup --strict`.
- [x] 3.2 Run `node --test test/descriptions.test.mjs`, `npm run openspec:check` and `npm run layout:check`.
