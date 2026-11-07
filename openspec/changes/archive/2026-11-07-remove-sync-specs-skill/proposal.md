# Remove the manual sync-specs skill

## Why

The plugin ships `openspec-sync-specs`, a skill that tells the model to edit main specs by hand. The bundled OpenSpec CLI has no command for merging delta specs without archiving, and the skill cannot reproduce the archive merger's validation, conflict handling, scenario checks, idempotency or rollback. The policy also says every workflow step goes through an `openspec_*` tool, so the skill is an exception that contradicts the rule it ships with. Keeping it presents an unsupported, best-effort operation as a supported flow.

## What Changes

- **BREAKING** Remove the packaged `openspec-sync-specs` skill. The provider offers five workflow skills instead of six.
- State in the flow policy that main specs are updated only by `openspec_archive`, that hand-editing `openspec/specs/` is unsupported, and that a stale `openspec-sync-specs` copy must not be followed.
- State in the tool-surface spec that the plugin exposes no sync-only write tool, so the unsupported boundary is a contract rather than a documentation note.
- Document the migration: existing projects and the separate evaluation repository must delete their `.dsh/skills/openspec-sync-specs/` copies, because the provider no longer shadows them.
- Remove the skill's counts from the README, `AGENTS.md` and the `index.js` header.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `skill-provider`: the provider offers five packaged skills; the catalog no longer contains `openspec-sync-specs`.
- `tool-surface`: adds the requirement that no sync-only write tool exists.
- `flow-policy`: adds the requirement that the flow rule refuses sync-only work and points to archive.

## Impact

- `skills/openspec-sync-specs/SKILL.md` and its directory are deleted.
- `lib/skills.js` loses one `SKILL_NAMES` entry; `index.js`'s header comment changes from six to five.
- `lib/policy.js` gains one rule; `test/policy.test.mjs` asserts it.
- `test/integration.test.mjs` and `test/skills.test.mjs` assert the five-skill catalog and the absent document.
- `README.md` and `AGENTS.md` change their counts, flow table and migration notes.
- `package.json`, `package-lock.json` and the five remaining skill frontmatters carry the new plugin version.
- Existing projects and `dsh-openspec-flow-eval` need their stale skill copies removed manually.
