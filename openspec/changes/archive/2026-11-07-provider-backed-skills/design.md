# Design: Provider-backed skills

## Context

See `proposal.md` for why. Current state that shapes the approach:

- `lib/skill.js` already registers one runtime skill (`openspec-flow`) through `ctx.get('skills')`, with `source: 'runtime'` and the registry's fixed rank 250.
- The six workflow skills reach a session only after `openspec_init` writes them into `<project>/.dsh/skills/`, where `dsh-skill-filesystem` discovers them at rank 100.
- `lib/skills.js` owns packaged-skill reading, frontmatter parsing, hashing, `generatedBy` classification, backup, write and conflict reporting.
- Constraints: no runtime imports from `@deepseek-ai/*` (a linked profile install cannot resolve them), `ctx.skills` may be absent, Node built-ins only, DSH `0.2.2-rc.1` provider contract.

## Goals / Non-Goals

Goals:

- One packaged copy of each skill, served by one provider, with no project writes.
- Catalog construction reads frontmatter only; bodies load on selection.
- `openspec_init` keeps only the project-initialization behavior.

Non-Goals:

- Changing the instruction text of the six workflow skills or the `openspec-flow` body beyond its init section.
- Adding a per-project override mechanism; rank 50 makes the plugin text authoritative.
- Changing the tool surface, CLI pin or schema handling.

## Decisions

### Single provider with rank 50

Register one provider named `openspec-flow` that returns seven candidates, each at rank 50. `registerProvider` is required because `register()` has no rank parameter and fixes the rank at 250, which would lose to a project's `.dsh/skills` copy at 100. Rank 50 is below the filesystem provider's project ranks (100 and 200), so the packaged text wins and an upgrade takes effect after a session restart. Alternatives rejected: per-skill `register()` calls (rank 250, shadowed by project copies); the filesystem provider's `bundledSkillDir` (needs an absolute path in the bundle patch, which a linked install cannot express portably); several providers (no precedence benefit, more registrations).

### Uniform candidate shape

All seven candidates carry the same `source: 'bundled'`, `invocation: { modelInvocable: true, userInvocable: true }`, a `resourceBase` pointing at the skill's package directory, and an absolute `locator`. `openspec-flow` is folded into the same provider instead of keeping its own registration, so one disposal and one catalog path cover every skill.

### Lazy list, fresh get

`list()` reads each packaged document's frontmatter only and returns name and description. `get()` reads the full document and returns its body. Bodies are never cached, so an edited package document is picked up on the next load while the catalog digest stays stable when only bodies change. The locator is the absolute path of the packaged `SKILL.md`.

### Malformed document skips, not fails

A document that fails validation is omitted with one warning and does not affect the other six or the plugin's tools. The previous `openspec-flow` registration failed plugin activation on a bad document; that behavior is replaced because a single document defect should not remove five working tools, and the skill's absence is observable in the catalog and the warning. Test coverage asserts the skip behavior.

### `lib/skills.js` narrows to read-only discovery

Keep `SKILL_NAMES`, `packagedSkillPath`, `parseFrontmatter`, `PLUGIN_VERSION`/`GENERATED_BY` and `isDirectory`; remove `UPSTREAM_VERSION`, `BACKUP_ROOT`, `hashContent`, `classifyGeneratedBy`, `inspectSkill`, `backupDirectory`, `backupSkill`, `writeSkill`, `readPackagedSkills` and `installSkills`. `lib/skill.js` keeps the provider, frontmatter-to-candidate mapping and body loading. Two files instead of one preserves a direct test import and keeps the provider file readable.

### `openspec_init` returns only `{ root, config }`

The tool keeps its target-directory and writability checks and the `init --tools none` call; it drops the `force` parameter, the `skills` object and the `backupDir` field. With no project writes there is no conflict, backup or force decision to expose.

### Delete the repository's own `.dsh/skills` copies

At rank 50 those six tracked copies can never win, so keeping them would maintain two texts that disagree silently. The untracked `.dsh/openspec-flow-backup/` history is outside this change.

## Risks / Trade-offs

- [A project can no longer override a workflow skill locally] → the rank-50 contract is documented; a genuinely different workflow needs a differently named skill.
- [External callers read `openspec_init`'s `skills` field] → BREAKING, called out in the tool description and README.
- [A malformed document degrades quietly at runtime] → warning plus test coverage; runtime diagnostics beyond that are out of scope.
- [Registry absent means no skills] → tools remain registered; same posture as the current optional `ctx.skills`.

## Migration Plan

Restart the session after upgrading; the catalog comes from the provider immediately. Projects that ran an older `openspec_init` may delete their `.dsh/skills/openspec-*` copies, which are already shadowed. Rollback restores the previous `register()` call and `installSkills`; no data migration exists.

## Open Questions

None.
