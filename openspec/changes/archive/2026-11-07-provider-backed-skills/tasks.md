# Tasks

## 1. Provider

- [x] 1.1 Extend `test/fake-context.mjs` with `registerProvider` support and verify `test/skill.test.mjs` can register a provider against it.
- [x] 1.2 Register the provider in `lib/skill.js`: seven candidates (six `SKILL_NAMES` plus `openspec-flow`), rank 50, `source: 'bundled'`, shared invocation policy and `resourceBase`; verify the provider test sees all seven names.
- [x] 1.3 Make `list()` read frontmatter only and `get()` read the body on demand; verify a test asserts the body is absent from list results and present after `get()`.
- [x] 1.4 Skip a malformed packaged document with one warning instead of failing activation; verify a test removes or breaks one document and still sees the other six candidates and every tool.
- [x] 1.5 Verify a missing or minimal `ctx.skills` leaves the tools registered and logs one warning.
- [x] 1.6 Confirm the provider wins over a same-named `.dsh/skills` copy by asserting candidate rank 50 in the test fixture.

## 2. Library cleanup

- [x] 2.1 Remove `installSkills`, `writeSkill`, `inspectSkill`, `classifyGeneratedBy`, `backupDirectory`, `backupSkill`, `hashContent` and the version/backup constants from `lib/skills.js`; verify `grep -rn "installSkills\|classifyGeneratedBy" lib test` returns nothing.
- [x] 2.2 Keep `SKILL_NAMES`, `packagedSkillPath`, `readPackagedSkills` and `parseFrontmatter`, and have `lib/skill.js` consume them; verify `node --test test/skill.test.mjs test/skills.test.mjs` passes.
- [x] 2.3 Delete `test/skills.test.mjs` cases that cover installation, backup and conflict classification; verify no test imports a removed function.

## 3. Narrow `openspec_init`

- [x] 3.1 Change `lib/init.js` to return `{ root, config }`, drop the `skills` and `backupDir` output, drop the `force` parameter, and keep the directory, writability and `init --tools none` behavior; verify the updated tool description names no skill write.
- [x] 3.2 Update the `openspec_init` output schema and description in `lib/init.js`; verify `test/schema.test.mjs` and `test/config.test.mjs` still pass.
- [x] 3.3 Update `test/integration.test.mjs` init assertions to the new result shape and to the absence of `.dsh/skills`; verify the integration test passes on Node 24.
- [x] 3.4 Delete the six tracked `.dsh/skills/openspec-*/SKILL.md` copies; verify `git status --short .dsh` shows only deletions and `git ls-files .dsh` returns empty.

## 4. Documentation and policy

- [x] 4.1 Rewrite the `openspec_init` clause in `lib/policy.js` to describe project initialization, and update `test/policy.test.mjs`; verify the policy test passes and the text still names `openspec_init`.
- [x] 4.2 Replace the "Initialize or migrate" section of `skills/openspec-flow/SKILL.md` with provider-delivery and initialization wording; verify `grep -n "writes six plugin skills" skills/openspec-flow/SKILL.md` returns nothing.
- [x] 4.3 Update `README.md` (initialization section, file list) and `AGENTS.md` (skill delivery, init description) to describe the provider and rank 50; verify no remaining text claims init installs skills.

## 5. Verification

- [x] 5.1 Run `openspec_validate provider-backed-skills` and confirm no errors or warnings.
- [x] 5.2 Run `npm test` on Node 24 and confirm the whole suite passes.
- [x] 5.3 Run `npm run coverage:check` and, if the deletion moves the baseline, update `coverage.baseline.json` and record why in the commit message.

## Workflow follow-up

- Archive with `openspec_archive` only after the user asks, then commit the archive, documentation and merged specs in one commit and push to `origin/main`.
