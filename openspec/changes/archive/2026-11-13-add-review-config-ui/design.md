# Design: review configuration page

## Context

The plugin is Host-only, uses a hand-written Standard Schema, and locks review behavior per change. The page must add a Web Client half without moving review decisions into the browser.

## Decisions

### Host owns validation and persistence

The Client page only renders fields and calls Remote methods. `reviewSettings.update` validates the complete candidate in two stages: the plugin Config schema first, because it is synchronous and shape-only, then the model catalog, because an explicit provider, model or effort can only be checked against `llm`. Only a candidate that passes both reaches `configEditor.edit(entry, current => next)`. The editor keeps profile comments and other rows, and a rejected candidate leaves the file unchanged.

### Keep the Standard Schema; add a Host RPC channel

The Config export stays hand-written because a linked install must not import `@deepseek-ai/*` at runtime. The page does not rely on the automatic Config form; it uses explicit Remote methods for model discovery and saving.

A generated Typert Remote is unavailable to this plugin: the client half would need build-time invocation descriptors and the Host half `@deepseek-ai/*` runtime imports, both of which a linked plain-ESM install cannot carry. The plugin therefore registers one prefix route on `ctx.webServer` under `/openspec-review`, fenced by `ctx.connection.admit`, and the page calls it with `ctx.connection.rpc.call('/openspec-review', endpoint, payload)`. Both halves take the channel path and the endpoint names from one module, `lib/client/channel.js`, so a spelling cannot drift between them: method name `reviewModels.providers` is endpoint `reviewModels/providers`, `reviewModels.models` is `reviewModels/models`, `reviewModels.efforts` is `reviewModels/efforts`, `reviewSettings.get` is `reviewSettings/get`, `reviewSettings.update` is `reviewSettings/update`, and `reviewPolicies.list` is `reviewPolicies/list`. The route is registered only while `connection` and `webServer` are both present, so a headless profile keeps its tools and loses only the page's data source.

### Project facts come from the live agents

The configuration page is a profile-level `plugins.row.config` entry and belongs to no project, while locked policies and git availability are per project. `reviewPolicies/list` therefore derives its answer from the Host: it reads `ctx.agents.list()`, takes each agent's working directory from `workingDirectory`, keeps the directories that hold an `openspec/` root, and reports `{ projects: [{ path, git, changes }] }`, where each change carries only its name, store, lock time and two review sections. Two agents in one directory yield one project, and the list is empty when no live agent works in an OpenSpec project. The page says the settings themselves are profile-level and affect only new changes.

### Model resolution is part of policy locking

`buildPolicy` resolves `inherit` from `ctx.agentDefaultModel.currentSelection()`; if unavailable it tries the initiating agent's current model; otherwise it throws. The resolved model is stored in `policy.json`, and its `reasoningEffort` is recorded only when the selection names one. Older policies without a model are migrated on the next review start by resolving once and writing the field.

### Activation receives `agentOptions`

`startActivation` passes `{ provider, model, reasoningEffort }` from the policy. Before starting, the plugin verifies the provider supports `agentOptions`, the provider is in `ctx.llm.listProviders()`, the model resolves, and the effort is in `reasoning.efforts`. Any failure is a fail-closed start.

### The client half is a hand-written loader bundle

`client.js` is written directly in the `window.__ModuleLoader__.load({ id, factory(require) })` form the Web page's module system serves, so the package needs no build step and no new dependency: React comes from the module table and the page is built from `React.createElement`. The bundle is exported as `./client` and declared under `dsh.client`, which is how the Host turns it into a served bundle. The page registers `plugins.row.config` with key `dsh-openspec-flow#openspec-flow`; its strings go through the Client locale service under the `openspecReview` namespace.

### Saving restarts the plugin

Ordinary config fields are not volatile. After a successful save, the editor restarts the plugin row; the page must say that a reload may be needed and that locked policies are unaffected.

## Risks

- The client half adds a hand-written browser bundle to a previously Host-only repository.
- Model catalogs can be slow; the Remote caches for 60 seconds and returns an error instead of stale selectors when the catalog is unavailable.
- Inherit resolution can fail at change creation; the user must configure an explicit model or a changer model first.
- The page's row key must match the installed bundle; a mismatch leaves the page invisible.

## Migration

Existing policies without `reviewerModel` migrate on the next start by resolving inherit once. Existing profile configs without review fields keep the defaults. Removing the Client half leaves Host behavior unchanged.
