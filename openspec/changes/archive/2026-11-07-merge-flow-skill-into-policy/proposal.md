# Proposal

## Why

The packaged `openspec-flow` skill repeats rules that already reach the same agent: the scoped flow policy states every stage gate, the six stage skills own their loops, and the tool descriptions carry the schema and store constraints. Its remaining content, a tool table and a stage-to-skill list, restates the tool and skill catalogs that are already visible. The copy costs a maintained document and catalog attention without adding behavior.

## What Changes

- **BREAKING** Remove the packaged `openspec-flow` skill. The skill provider serves six workflow skills, and the `/openspec-flow` command no longer resolves.
- Keep `lib/policy.js` unchanged: nothing moves into the always-loaded policy section.
- Remove the dead `loadSkillDocument()` helper and the now-meaningless `PACKAGED_SKILL_NAMES` alias, so the provider reads the one `SKILL_NAMES` list.
- Update the tests, `README.md`, `AGENTS.md`, and the two affected capability specs.
- No tool schema, tool output, or policy text changes; no project data migration.

## Capabilities

### Modified Capabilities

- `skill-provider`: the provider offers six packaged workflow skills instead of seven; the `openspec-flow` entry and its catalog assertion disappear.
- `development-workflow`: apply uses the `openspec-apply-change` skill, not the removed `openspec-flow` skill.

## Impact

- Code: delete `skills/openspec-flow/`; edit `lib/skill.js` (skill list, loader, header comment) and the `index.js` header comment.
- Tests: `test/skill.test.mjs` (loader test, list constant, name-only lookup) and `test/integration.test.mjs` (catalog assertion, loaded body).
- Docs: `README.md` (skills section, bootstrapping, file tree, limits) and `AGENTS.md` (apply step, provider sentence).
- Users: the `/openspec-flow` slash command is gone; `openspec-apply-change` and the other stage skills remain.
