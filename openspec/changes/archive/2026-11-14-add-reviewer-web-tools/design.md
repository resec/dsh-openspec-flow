# Design: reviewer web tools

## Context

See `proposal.md` — Why. The `openspec-reviewer` preset is one declaration in `cordis.patch.yml`; the plugin ships it through the bundle patch. The Host mounts the `web` service and its providers in `dsh-base`, while `dsh-web-app` disables the Host-level `tool-web` row so each preset composes its own web tool surface. The `web` service keeps separate search and fetch provider registries with independent readiness; the shipped composition selects `deepseek-search-api` for search and `http` for fetch. The preset's persona sets `complete: true`, so its prefix is the session's sole system prompt and other prompt sections, including tool guidance, do not render. The plugin pins `engines.dsh` to `=0.2.2-rc.2`, where every `dsh-tool-web` config field has a default.

## Goals / Non-Goals

Goals:

- The reviewer composes `web_search` and `web_fetch`.
- The preset stays provider-agnostic: no web service instance, no provider entry, no provider selection key, and each tool follows the provider selected for its own operation.
- The preset still activates on the pinned runtime, stays workspace-read-only, and its Host `web` dependency is documented.
- A regression test encodes the tool composition and the provider-agnostic rule.

Non-Goals:

- Choosing `web.searchProvider` or `web.fetchProvider` for the deployment.
- URL allowlists, private-address blocking, or `tools/pre-execute` policy.
- Search-only or fetch-only configurations.
- Changing the reviewer persona, start prompt, or model; the `complete: true` persona is retained.
- Re-enabling the Host-level `tool-web` row.

## Decisions

### Mount `dsh-tool-web` inside the preset

The Host-level `tool-web` row is disabled by `dsh-web-app` on purpose, and the shipped presets each declare their own copy. The plugin follows that seam instead of re-enabling the Host row, which would give every agent web tools, including the changer. The preset entry carries `search: true`, `fetch: true` and `searchTimeoutMs: 60000`, matching the budget in `dsh-base` and the shipped `standard` preset.

Alternative: enable the Host row in the profile patch — rejected because it changes every agent's tool surface and moves the decision away from the plugin's preset.

### Let the deployment choose each operation's provider

The preset mounts only the tool plugin. `ctx.web` keeps separate search and fetch provider registries, and `dsh-tool-web` asks `searchReady()` before admitting `web_search` and `fetchReady()` before admitting `web_fetch`. Each tool therefore follows the provider selected for its own operation, and the two may differ. Hardcoding a provider in the preset is not possible without mounting a service instance, and mounting one would duplicate Host configuration and couple the plugin to one deployment's network policy.

Alternative: mount `dsh-web` plus a provider inside an isolated preset group — rejected for this change: it duplicates the Host `web` configuration, requires credentials and settings wiring inside the preset realm, and its isolation semantics are unverified here.

### Keep the reviewer persona and start prompt unchanged

The preset keeps `complete: true`, so the persona prefix is the reviewer's sole system prompt: `dsh-tool-web`'s system-prompt guidance does not render, and the reviewer relies on the tool schemas plus the per-result "external, untrusted data" notice carried by every web result. Editing the persona to add web guidance is outside this change; switching `complete` to false would also restore the deployment identity, suffix and runtime context, a larger behavior change. The residual prompt-injection risk is listed below.

Alternative: add one persona sentence about web use and untrusted content — deferred to a separate change because the agreed scope keeps the persona and start prompt unchanged.

### Explicit tool switches

`search: true` and `fetch: true` are written out even though both default to true. The composition decision then survives a future runtime default change and is visible in the patch. `fetchTimeoutMs` and the result/output caps keep their defaults so no provider-specific latency or cost assumption enters the preset.

## Risks / Trade-offs

- **Providers are selected per operation and can differ** → the spec, docs and docs verification distinguish search from fetch; one tool can be available while the other is withheld.
- **Destination policy is deployment-owned** → `docs/review.md` and `README.md` state that the selected provider decides target reachability and where the URL goes, and that the shipped anonymous HTTP provider reaches loopback, private-network and cloud-metadata addresses; deployments that need isolation must change the provider or add a `tools/pre-execute` policy.
- **Host `web` service dependency** → a Host without the web seam cannot compose the reviewer preset. The activation requirement and the docs state the prerequisite.
- **Prompt injection without system guidance** → the `complete: true` persona suppresses the tool guidance, so the reviewer sees only the per-result untrusted-content notice. A malicious page can still steer it; accepted for this change, and a persona instruction remains a follow-up decision.
- **Context cost** → two tool schemas enter reviewer requests; the tool guidance sections do not render under the complete persona, and each web result carries its untrusted-content notice.
- **Preset revision pinning** → an already-running reviewer keeps the revision it started with; new changes, `replace`, or new sessions get the new tools.

## Migration Plan

No data migration. Deployment: reload the plugin bundle or restart DSH, then start a new reviewer. Rollback: revert the commit and reload; new reviewer sessions return to the old tool surface, and running reviewer sessions are unaffected.

## Open Questions

None.
