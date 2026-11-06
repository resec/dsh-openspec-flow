# Proposal: Serve the workflow skills from a plugin provider

## Why

The six workflow skills reach an agent only after `openspec_init` copies them into a project's `.dsh/skills/`. That installation is a second source of truth: a project initialized by an older plugin version keeps its stale copies visible after the plugin upgrades, every consumer project receives files it did not ask for, and a session without those files gets no workflow skills at all. The plugin already ships the skill text and already registers one skill at runtime, so the copy step adds coupling without adding capability.

## What Changes

- Register one skill provider on `ctx.skills` that serves seven candidates: the six packaged workflow skills plus `openspec-flow`. Candidates carry rank 50, so the plugin text wins over `.dsh/skills` (100) and `.agents/skills` (200) and upgrades immediately apply.
- Keep discovery cheap: `list()` reads only frontmatter, `get()` reads the body on demand. A registry that is absent or lacks `registerProvider` downgrades to tools-only with one warning.
- **BREAKING** `openspec_init` becomes project initialization only: it creates `openspec/config.yaml` and the OpenSpec directory structure with `init --tools none`, and returns `{ root, config }`. It no longer writes skills, backs up official copies, migrates them, or reports conflicts.
- Delete the skill write, backup, migrate and conflict-classification code from `lib/skills.js`; keep packaged-skill reading and frontmatter parsing for the provider.
- Delete the six tracked `.dsh/skills/openspec-*` copies from this repository.
- Update the policy text, `skills/openspec-flow/SKILL.md`, `README.md` and `AGENTS.md` to describe the provider and the narrowed init.
- Replace the install/migration tests with provider tests: candidate set, rank, on-demand body reads, missing registry, and a malformed document.

## Capabilities

### New Capabilities

- `skill-provider`: how the plugin exposes its packaged workflow skills to a session — candidate set, rank, lazy loading, degraded registry, and malformed-document handling.

### Modified Capabilities

- `skill-adaptation`: removes the install, backup, migrate and conflict requirements; the capability now covers only project initialization and the instruction-to-tool mapping.

## Impact

- `lib/skill.js`: provider registration replaces the single runtime skill registration.
- `lib/skills.js`: read/parse retained; write, backup, classify and install removed.
- `lib/init.js`: tool description, output schema and execute path narrowed to project initialization.
- `lib/policy.js`: the `openspec_init` clause now describes initialization, not installation.
- `skills/openspec-flow/SKILL.md`, `README.md`, `AGENTS.md`: describe provider delivery.
- `test/skill.test.mjs`, `test/skills.test.mjs`, `test/fake-context.mjs`, `test/integration.test.mjs`, `test/policy.test.mjs`: provider coverage and removed install coverage.
- `.dsh/skills/openspec-*`: six tracked copies deleted.
- No change to the tool surface, the bundled CLI pin, or the skill document text.
