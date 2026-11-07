# skill-provider Delta

## MODIFIED Requirements

### Requirement: Provider exposes the packaged workflow skills

The plugin SHALL register one skill provider that offers the five packaged workflow skills and no entry-point skill.

#### Scenario: Session catalog is built
- **WHEN** an agent with the plugin's tools requests its skill catalog
- **THEN** the catalog contains `openspec-explore`, `openspec-propose`, `openspec-apply-change`, `openspec-archive-change` and `openspec-update-change`, with no `openspec-flow` entry and no `openspec-sync-specs` entry

#### Scenario: Skill registry is unavailable
- **WHEN** the deployment has no `ctx.skills` registry or it lacks `registerProvider`
- **THEN** the provider is not registered, one warning names the missing capability, and every tool remains callable
