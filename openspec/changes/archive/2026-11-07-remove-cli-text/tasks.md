# Tasks: Remove CLI mentions from skills and tool descriptions

## 1. Skills

- [x] 1.1 Remove every CLI mention from the seven `skills/*/SKILL.md` files while keeping the report-and-stop rule, and verify `grep -rn 'CLI' skills/` returns nothing
- [x] 1.2 Replace the no-fallback assertions in `test/skills.test.mjs` with a ban on the `CLI` token and a bare `openspec` command, and verify `node --test test/skills.test.mjs` passes

## 2. Tool descriptions

- [x] 2.1 Rewrite the nine tool schema descriptions in `lib/tools/apply.js`, `lib/tools/query.js`, `lib/tools/shared.js` and `lib/init.js`, and verify `grep -rn 'CLI' lib/tools/*.js lib/init.js | grep description` returns nothing
- [x] 2.2 Add `test/descriptions.test.mjs` that walks every registered tool's parameter and result descriptions and fails on a `CLI` token, and verify `node --test test/descriptions.test.mjs` passes

## 3. Policy

- [x] 3.1 Rewrite the policy sentence in `lib/policy.js` without naming the CLI, and verify `grep -n 'CLI' lib/policy.js` returns nothing
- [x] 3.2 Replace the no-fallback assertion in `test/policy.test.mjs` with a ban on the `CLI` token, and verify `node --test test/policy.test.mjs` passes

## 4. Specs and verification

- [x] 4.1 Update the `skill-documentation` purpose in `openspec/specs/skill-documentation/spec.md` and verify the purpose describes the no-mention rule
- [x] 4.2 Run `openspec_validate remove-cli-text` and verify it passes
- [x] 4.3 Run `npm test` on Node 24 and verify it passes
- [x] 4.4 Run `npm run coverage:check` and verify it passes

## Workflow follow-up

- Archive the change after the user asks, merging the delta specs into the main specs.
- Commit the archive, the merged specs and the text changes in one commit, then push to `origin/main`.
