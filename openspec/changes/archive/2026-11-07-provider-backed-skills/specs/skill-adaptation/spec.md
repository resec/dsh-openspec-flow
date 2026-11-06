# Spec Delta

## MODIFIED Requirements

### Requirement: Skills use tools and report missing tools

Each packaged skill SHALL direct the agent to the `openspec_*` tools for every workflow step and SHALL state that the plugin provides no CLI fallback. When a tool is unavailable, the skill SHALL instruct the agent to report the missing tool and stop.

#### Scenario: Tool surface is present

- **WHEN** the agent loads a packaged skill in a session with the plugin tools
- **THEN** every workflow step in the skill names a tool call and no bare `openspec` command is required

#### Scenario: A tool is unavailable

- **WHEN** the agent loads a packaged skill in a session without the plugin tools
- **THEN** the skill states that the plugin provides no CLI fallback and the agent reports the missing tool instead of running the CLI

## ADDED Requirements

### Requirement: Init creates the OpenSpec project structure

`openspec_init` SHALL create `openspec/config.yaml` and the OpenSpec directory structure through the bundled CLI's `init --tools none`, and SHALL NOT generate official skills or AI-tool configuration.

#### Scenario: Empty project is initialized

- **WHEN** `openspec_init` runs in a directory without `openspec/config.yaml` or `openspec/config.yml`
- **THEN** the project has `openspec/config.yaml`, `openspec/specs/`, `openspec/changes/` and `openspec/changes/archive/`, and no `AGENTS.md` or skill file is generated

#### Scenario: Existing config is preserved

- **WHEN** `openspec_init` runs in a project that already has `openspec/config.yaml`
- **THEN** the CLI is not run, the config file is not rewritten, and the result reports `config: "exists"`

#### Scenario: Target is not writable

- **WHEN** the target directory cannot be written
- **THEN** the tool returns an actionable error and leaves the project unchanged

### Requirement: Init returns the project root and config state

`openspec_init` SHALL return the resolved project root and whether this call created the configuration.

#### Scenario: Init result is read

- **WHEN** `openspec_init` completes
- **THEN** the result contains `root` and `config`, where `config` is `"created"` or `"exists"`

## REMOVED Requirements

### Requirement: Init installs plugin skills without official skills

**Reason**: Skill delivery moved to the plugin's skill provider, so init no longer writes skills.

**Migration**: Load the packaged workflow skills from the plugin provider; do not expect `.dsh/skills/openspec-*` after init.

### Requirement: Official skill migration backs up first

**Reason**: The plugin no longer replaces files in the project, so there is nothing to back up or migrate.

**Migration**: Delete any `.dsh/skills/openspec-*` copies an earlier init wrote; the provider supplies the text at rank 50 and ignores project copies.

### Requirement: Plugin version refresh is explicit

**Reason**: Packaged skills follow the plugin version automatically, so no re-install step is needed.

**Migration**: Restart the session after upgrading the plugin; the provider reads the new packaged documents.

### Requirement: User-authored skills are preserved

**Reason**: The plugin no longer writes into the project, so it cannot overwrite a user-authored skill.

**Migration**: Keep hand-written skills in `.dsh/skills/` or `.agents/skills/` under a different name; a same-named one is shadowed by the provider.
