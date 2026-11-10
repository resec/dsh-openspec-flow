# Align the propose and explore skills with the official spec-read guidance

## Why

The shipped `openspec-propose` skill can propose a change without reading what the existing specs already require, and the `openspec-explore` skill treats a filtered `openspec_show` read as sufficient. OpenSpec 1.16.1's own templates require the opposite: a filtered read is only an overview, the relevant spec must then be read in full including scenarios, and the propose workflow must surface conflicts with existing specs instead of deciding them silently.

## What Changes

- `openspec-propose`: before stating the change scope, list capabilities with `openspec_list` (`specs: true`), take a filtered overview with `openspec_show` (`type: "spec"`, `noScenarios: true`), read each relevant capability in full with `openspec_show` (`type: "spec"`), name the capability and requirement behind each conclusion, and surface a conflict with an existing requirement instead of deciding it silently. The confirmation step also names the existing specs the change touches.
- `openspec-explore`: state that a filtered read is only an overview and require a full read of every relevant spec, including scenarios, before saying what a capability covers or what should change. Keep the "read only what the question needs" bound: start filtered, then read in full what the answer depends on.
- Add a regression test that locks both requirements in the packaged skill text.
- Update the README skill comparison table for the two skills.

Non-goals:

- Do not change `lib/policy.js`; the standing rule keeps its current gates.
- Do not add the official `config.yaml` read to explore.
- Do not change the tool surface, the bundled CLI version, or the package version.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `skill-adaptation`: add a requirement that the propose skill reads existing specs and surfaces conflicts before proposing scope, and a requirement that the explore skill reads relevant specs in full after a filtered overview.

## Impact

- `skills/openspec-propose/SKILL.md` and `skills/openspec-explore/SKILL.md`: instruction text only; frontmatter and `generatedBy` stay unchanged.
- `test/skills.test.mjs`: new assertions over the two skill documents.
- `README.md`: two rows of the official-skill comparison table.
- No runtime code, tool schema, dependency or policy change. The token cost is paid only when a skill is loaded; the extra read calls are the main runtime cost.
