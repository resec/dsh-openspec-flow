# Adopt OpenSpec flow for plugin development

## Why

The plugin is installed and its tools work, but the plugin's own repository has no OpenSpec project and no project instructions. Development therefore cannot dogfood the compact apply loop, and each session has to rediscover how the plugin's tools, project skills, and tests fit together.

## What Changes

- Initialize the repository as a spec-driven OpenSpec project.
- Add project instructions that route planning through OpenSpec and apply through the installed `openspec-flow` tools.
- Document the self-hosting loop in the README.
- Verify the change with `openspec validate` and the existing test suite.

## Impact

- Affected specs: `development-workflow` (new capability)
- Affected code: `README.md`, `AGENTS.md`; project files under `openspec/` and `.dsh/skills/`; a local `@fission-ai/openspec` devDependency
- Runtime behavior of the five tools is unchanged.
