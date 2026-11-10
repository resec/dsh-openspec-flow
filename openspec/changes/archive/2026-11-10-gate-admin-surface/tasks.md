# Tasks: gate-admin-surface

## 1. Block state and command

- [x] 1.1 Add `lib/admin.js` with the per-agent block state, `isAdminOpen`, the open/close transitions and the `agent/status` subscription, and verify `node --test test/admin.test.mjs` covers open → running → idle → closed
- [x] 1.2 Register `/opsx-admin` in `lib/admin.js` with the `off` and intent grammar and the steered user message, and verify `test/admin.test.mjs` covers the usage error, the early close and intent steering
- [x] 1.3 Wire the state and command into `index.js` `apply()` with the optional `commands` service and the fail-open branch, and verify `test/integration.test.mjs` registers 13 tools without a command registry and 10 with one

## 2. Tool registration

- [x] 2.1 Pass the `when` condition for `openspec_init`, `openspec_store_list` and `openspec_schemas` at their registration sites, and verify `test/admin.test.mjs` asserts `ctx.tools.definitions(agent)` omits all three while closed and includes them while open
- [x] 2.2 Verify a closed-block call is not executable by asserting `ctx.tools.executable('openspec_store_list', agent)` is `undefined` while closed and defined while open

## 3. Policy and skill text

- [x] 3.1 Add the management gate to `POLICY_TEXT` in `lib/policy.js`, and verify `test/policy.test.mjs` asserts the section names `/opsx-admin` and still contains no `CLI` token
- [x] 3.2 Update `skills/openspec-explore/SKILL.md`, `skills/openspec-propose/SKILL.md` and `skills/openspec-apply-change/SKILL.md` to ask for `/opsx-admin` when a gated tool is needed, and verify `test/skills.test.mjs` asserts the routing text and the existing CLI and command-map guard still passes

## 4. Documentation

- [x] 4.1 Update `README.md`: mark the three management tools as gated in the tool tables and add the `/opsx-admin` section, and verify `grep -n '/opsx-admin' README.md` shows the section and the three tools are listed as management-only

## 5. Gates

- [x] 5.1 Run `npm test` on Node 24 and verify every test passes
- [x] 5.2 Run `npm run coverage:check` on Node 24 and verify the gate passes
- [x] 5.3 Run `openspec_validate` with `strict: true` and verify no findings remain

## Workflow follow-up

- Archive the change only when the user asks, then commit the archive, the documentation updates and the merged specs in one commit.
- Do not push until the archive commit exists; the repository pushes `main` to `origin/main` after archiving.
