# Project instructions

This repository develops the `dsh-openspec-flow` plugin. `README.md` covers the tool surface, configuration, and limits; this file covers how work is planned and checked.

## OpenSpec workflow

The project uses OpenSpec. Non-trivial work starts as a change under `openspec/changes/<name>/`:

1. Plan with the installed `openspec-propose` skill, or `openspec_new_change` (the CLI `openspec new change <name>` works too). Read the change's `proposal.md`, `specs/`, `design.md`, and `tasks.md` before editing code.
2. Apply with the installed plugin. Invoke `/openspec-flow <name>` or load `openspec-apply-change`, then call `openspec_apply_next` once. The project carries the upstream skill of the same name; name `openspec-flow` explicitly to select the compact loop.
3. After each task, call `openspec_mark_task_done` with the returned id and continue with its `next`. Call `openspec_apply_next` again only to start or resync.
4. Finish with `openspec_validate <name>` and the relevant suite on Node 24 (`npm test`, `npm run test:eval`, or `npm run test:all`). Archive with `openspec_archive` only when the user asks.
5. After archiving, commit the archive, the documentation updates, and the merged specs in one commit, then push to `origin/main` (`git@github.com:resec/dsh-openspec-flow.git`).

`openspec_init` installs the six plugin skills and migrates official copies after backing them up. This repository currently keeps the official skills in `.dsh/skills`; run `openspec_init` when you want the plugin text installed.

The plugin also registers a scoped system prompt rule (`openspec-flow:policy`) for agents whose working directory contains an `openspec/` root. It restates these gates: clarify before proposing, confirm before creating a change, apply through the compact loop, validate before completion, and archive only on request. The rule is advisory and does not restrict tools.

Checkbox state changes go through `openspec_mark_task_done`; that keeps the cached progress and the source line consistent.

## Plugin constraints

- Plain ESM JavaScript with Node built-ins only. Runtime imports of `@deepseek-ai/*` break a linked profile install.
- `engines.dsh` pins the exact DSH runtime the plugin is verified against, and `engines.node` mirrors that runtime's Node floor. When upgrading the DSH dependency, read the target version's `engines.node` first and update both fields together; a mismatch makes DSH skip the bundle.
- Tests and coverage run only on the primary Node major 24 and require a concrete version satisfying `engines.node`. Entrypoints check the `node` on PATH; they never call fnm, nvm, volta, or read `.nvmrc`. If the runtime does not qualify, they fail before starting tests.
- The OpenSpec CLI is an exact runtime dependency (`@fission-ai/openspec` 1.16.0). The plugin resolves only its own installed copy; do not reintroduce `cliPath`, PATH lookup, or project-local lookup.
- Keep tool descriptions and output schemas in `lib/tools/`, the projection and cache in `lib/state.js`, the init and migration logic in `lib/init.js` and `lib/skills.js`, and the shipped skills in `skills/` in sync with behavior.
- Every packaged skill's `metadata.generatedBy` must equal `dsh-openspec-flow@<package.json version>`; the skill test enforces it.
- Keep the policy text in `lib/policy.js` consistent with the shipped skills. The policy is agent-scoped and must never be registered globally.
- Add a regression test for every behavior change. The tests use a fake Host context and the real bundled OpenSpec CLI.

## Evaluation harness

- `eval/` is a manual real-model harness. `npm test` and `npm run test:eval` must stay offline: never add a real provider call or `dsh` invocation to either suite.
- Do not run `eval/run.mjs --execute` unless the user explicitly asks; it spends provider tokens. A dry run (`npm run eval:dry`) is free.
- Real fixtures pin base and reference commits from this repository's history. Do not rewrite those commits; if a fixture needs a new base, update its manifest and tests together.
- Hidden acceptance lives under `eval/fixtures/<id>/acceptance/` and is injected only after a run. Keep it out of the fixture tree and out of the request text's file list.
- Real runs use a generated `headless` profile under `eval/.dsh-home` and an empty `eval/.agents-home`; the harness copies `~/.dsh/.credentials.yaml` (or `--source-home`), removes both roots afterward, and never writes to the default `~/.dsh`.
- `--concurrency <n>` gives each worker its own home and profile. Start with 2, watch provider retries and invalid cells, and remember that concurrency changes wall time only, not token cost.

## Verification

A change is complete when every task is checked, `openspec validate <name>` passes, the relevant test suite passes on Node 24 (`npm test` for plugin code, `npm run test:eval` for `eval/`, or `npm run test:all` when both), and `npm run coverage:check` passes. The installed plugin is linked into the `web` profile; re-enable the `include:openspec-flow` entry or restart DSH to load changed Host code in a live session.
