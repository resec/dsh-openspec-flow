# Give the reviewer web search and fetch

## Why

The independent reviewer can read the brief, the change artifacts and the workspace, but it cannot check any external fact a brief cites — an upstream release note, a dependency changelog, a specification page. It must either accept the changer's claim or mark the review blocked. The profile configures `reviewers: 1` for both draft and apply review, so this gap applies to every reviewed change.

## What Changes

- Mount `@deepseek-ai/dsh-tool-web` in the `openspec-reviewer` preset with `search: true`, `fetch: true` and `searchTimeoutMs: 60000`, adding the `web_search` and `web_fetch` model-facing tools.
- Keep the preset provider-agnostic: it mounts the web tool plugin only, and neither mounts nor selects a web service provider. Each tool resolves the provider the deployment configures on the Host `web` service for its operation — search for `web_search`, fetch for `web_fetch`.
- Keep the reviewer tool surface otherwise unchanged: no `bash`, `write`, `edit`, `subagent`, `workflow`, or the changer's `openspec_review`.
- Extend the `tool-surface` spec: the reviewer preset composes both web tools, chooses no provider, and its pinned-runtime requirement covers the web tool child.
- Update `docs/review.md` and `README.md` to describe the reviewer's web access and the provider-neutral dependency.
- Add a regression assertion to the preset test: the web tool child is present with both tools enabled, and no web service or provider entry appears in the patch.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `tool-surface`: the reviewer preset composes `web_search` and `web_fetch` without selecting a provider, and its activation requirement covers the web tool child.

## Impact

- `cordis.patch.yml`: one nested plugin entry inside the `openspec-reviewer` preset.
- `test/review.test.mjs`: one new test; the existing preset test is retained.
- `docs/review.md` and `README.md`: reviewer-mode wording.
- `openspec/changes/add-reviewer-web-tools/specs/tool-surface/spec.md`: two modified requirements and one added requirement.
- No package dependency, `engines.dsh`, Node floor, model, persona, prompt, or skill change. The preset adds one Host dependency: the `web` service must be mounted, and a Host without it cannot compose the reviewer.
- Provider choice, per-step readiness, and destination policy remain deployment configuration; the preset neither selects nor restricts them.
- Existing reviewer sessions keep the preset revision they started with; new changes, `replace`, or new sessions get the new tool set.
