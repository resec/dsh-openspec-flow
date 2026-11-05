# Design: Adopt OpenSpec flow for plugin development

## Context

The repository is a plain ESM package that is linked into the `web` profile as a DSH bundle. Its five tools read OpenSpec state and flip task checkboxes; its `openspec-flow` skill describes the compact apply loop. The repository itself was not an OpenSpec project, so the plugin could not manage its own changes.

## Decisions

1. **Dogfood the installed plugin.** Planning uses the upstream propose workflow; apply uses `/openspec-flow` and the five tools. The plugin's skill has runtime rank 250 while project skills rank 100, so the project instructions name `openspec-flow` explicitly to select the compact loop.
2. **Use a project-local CLI.** `@fission-ai/openspec` is a devDependency, and `node_modules/.bin/openspec` is the executable the plugin resolves from the session directory. This keeps the workflow self-contained and avoids a global install.
3. **Keep runtime code unchanged.** This change adds project instructions and documentation only. The tool schemas, output projection, and task parser stay as they are.
4. **Leave archiving to the user.** The change remains active after verification so the user can inspect the artifacts and archive them through the upstream workflow.

## Risks

- The upstream `openspec-apply-change` skill and the plugin's `openspec-flow` skill both exist; the project instructions disambiguate them.
- `.dsh/` and `openspec/` are project files and are outside the plugin package's `files` list, so a packed bundle stays clean.
- The devDependency and `node_modules` are development-only; the plugin still has no runtime dependencies.
