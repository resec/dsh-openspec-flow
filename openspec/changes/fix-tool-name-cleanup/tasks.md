# Tasks

## 1. Rename the tools in the specs

- [x] 1.1 Replace `openspec_status` / `openspec_validate` in the schema-compatibility delta.
- [x] 1.2 Replace them in the development-workflow delta.
- [x] 1.3 Replace `openspec_validate` in the flow-policy delta.

## 2. Clean the description and guard it

- [x] 2.1 Describe `strict` in the per-action definition without naming a command, and register that description instead of a second copy.
- [x] 2.2 Add a description test that rejects an `openspec <verb>` command name, sharing the document guard's command list and scanning the review tool with both review modes enabled.
- [x] 2.3 Confirm the test fails when the per-action `strict` description names `openspec validate` again, so the registered copy cannot drift from it.

## 3. Verify

- [x] 3.1 Run `openspec validate fix-tool-name-cleanup --strict`.
- [x] 3.2 Run `node --test test/descriptions.test.mjs`, `npm run openspec:check` and `npm run layout:check`.
