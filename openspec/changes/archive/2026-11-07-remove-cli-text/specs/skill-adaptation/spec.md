# skill-adaptation Delta

## REMOVED Requirements

### Requirement: Skills use tools and report missing tools

**Reason**: The requirement restates the tool-first rule and mandates a "no CLI fallback" sentence, which names the CLI the skills must no longer reveal. The behavior now lives in `skill-documentation`'s "Skills name only the tool surface".

**Migration**: No caller change; the packaged skills keep directing every step to a tool and report a missing tool. The no-fallback wording is dropped.
