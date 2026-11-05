# Project instructions

This repository develops the `dsh-openspec-flow` plugin. `README.md` covers the tool surface, configuration, and limits; this file covers how work is planned and checked.

## OpenSpec workflow

The project uses OpenSpec. Non-trivial work starts as a change under `openspec/changes/<name>/`:

1. Plan with the upstream `openspec-propose` workflow or `openspec new change <name>`. Read the change's `proposal.md`, `specs/`, `design.md`, and `tasks.md` before editing code.
2. Apply with the installed plugin. Invoke `/openspec-flow <name>` or load the `openspec-flow` skill, then call `openspec_apply_next` once. The project also carries the upstream `openspec-apply-change` skill; name `openspec-flow` explicitly to select the compact loop.
3. After each task, call `openspec_mark_task_done` with the returned id and continue with its `next`. Call `openspec_apply_next` again only to start or resync.
4. Finish with `openspec_validate <name>` and `node --test test/`. Archive with the upstream archive workflow when the user asks.

The plugin also registers a scoped system prompt rule (`openspec-flow:policy`) for agents whose working directory contains an `openspec/` root. It restates these gates: clarify before proposing, confirm before creating a change, apply through the compact loop, validate before completion, and archive only on request. The rule is advisory and does not restrict tools.

Checkbox state changes go through `openspec_mark_task_done`; that keeps the cached progress and the source line consistent.

## Plugin constraints

- Plain ESM JavaScript with Node built-ins only. Runtime imports of `@deepseek-ai/*` break a linked profile install.
- The OpenSpec CLI is an exact runtime dependency (`@fission-ai/openspec` 1.16.0). The plugin resolves only its own installed copy; do not reintroduce `cliPath`, PATH lookup, or project-local lookup.
- Keep tool descriptions and output schemas in `lib/tools.js`, the projection and cache in `lib/state.js`, and the shipped skill in `skills/openspec-flow/SKILL.md` in sync with behavior.
- Keep the policy text in `lib/policy.js` consistent with the shipped skill. The policy is agent-scoped and must never be registered globally.
- Add a regression test for every behavior change. The tests use a fake Host context and the real bundled OpenSpec CLI.

## Verification

A change is complete when every task is checked, `openspec validate <name>` passes, and `node --test test/` passes. The installed plugin is linked into the `web` profile; re-enable the `include:openspec-flow` entry or restart DSH to load changed Host code in a live session.
