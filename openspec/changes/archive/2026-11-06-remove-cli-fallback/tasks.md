# Tasks: Remove the CLI fallback promise

## 1. Policy

- [x] 1.1 Replace the fallback sentence in `POLICY_TEXT` with a statement that a missing tool is reported, and verify `grep -n 'fall back' lib/policy.js` returns nothing
- [x] 1.2 Add the no-fallback assertion to `test/policy.test.mjs` and verify `node --test test/policy.test.mjs` passes

## 2. Skills

- [x] 2.1 Remove the fallback sentence from all seven `skills/*/SKILL.md` files, state that the plugin provides no CLI fallback, and verify `grep -rn 'Fall back' skills/` returns nothing
- [x] 2.2 Reverse the fallback assertion in `test/skills.test.mjs` so every packaged skill must state the no-fallback rule and must not carry a fallback instruction, and verify `node --test test/skills.test.mjs` passes

## 3. Specs

- [x] 3.1 Update the `skill-documentation` purpose in `openspec/specs/skill-documentation/spec.md` to the no-fallback wording, and verify the purpose no longer says "prose fallback"
- [x] 3.2 Run `openspec_validate remove-cli-fallback` and verify it passes

## 4. Sync and full verification

- [x] 4.1 Run `npm test` on Node 24 and verify it passes
- [x] 4.2 Run `openspec_init` for this project and verify every `.dsh/skills/openspec-*/SKILL.md` matches its `skills/openspec-*/SKILL.md` counterpart
- [x] 4.3 Run `npm run coverage:check` and verify it passes

## Workflow follow-up

- Archive the change after the user asks, merging the delta specs into the main specs.
- Commit the archive, the merged specs and the text changes in one commit, then push to `origin/main`.
