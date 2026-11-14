# Project instructions

This repository develops the `dsh-openspec-flow` plugin. `README.md` covers the tool surface, configuration, and limits; this file covers how work is planned and checked.

## OpenSpec workflow

The project uses OpenSpec. Non-trivial work starts as a change under `openspec/changes/<name>/`:

1. Plan with the installed `openspec-propose` skill, or `openspec_new_change` (the CLI `openspec new change <name>` works too). Read the change's `proposal.md`, `specs/`, `design.md`, and `tasks.md` before editing code.
2. Review the plan before implementing: call `openspec_review` with `action: "start"` and `review: "draft"` (pass the user goal and acceptance conditions as `intent`; `start` is the first round only), read the brief, then submit one report. With `reviewers: 0` submit `action: "self-report"`; with `reviewers: 1` use `action: "wait"` for the independent reviewer. Fix every blocker and continue with `action: "resume"` (no intent) until the review is ready; `openspec_apply_next` refuses while it is not.
3. Apply with the installed plugin. Load `openspec-apply-change`, then call `openspec_apply_next` once.
4. After each task or batch, call `openspec_mark_task_done` with `taskIds` for every task finished since the last call and continue with its `next`. Call `openspec_apply_next` again only to start or resync.
5. Finish with `openspec_inspect` using `action: "validate"` and `strict: true`, and run `npm test` on Node 24.
6. Commit the implementation, then review it before archive: call `openspec_review` with `action: "start"` and `review: "apply"` (later rounds use `action: "resume"`), read the brief and diff, and submit the same way as step 2. Fix every blocker. A project without git has no apply review; say so instead of skipping silently. Archive with `openspec_archive` only when the user asks, and only after the apply review is ready.
7. After archiving, commit the archive, the documentation updates, and the merged specs in one commit, then push to `origin/main` (`git@github.com:resec/dsh-openspec-flow.git`).

The plugin serves the five workflow skills from its own skill provider at rank 50; it writes no project copy. `openspec_init` only creates the OpenSpec project structure. This repository keeps no `.dsh/skills/` copies. There is no sync-only flow: main specs are updated only by `openspec_archive`, and `openspec-sync-specs` must not be reintroduced.

The plugin also registers a scoped system prompt rule (`openspec-flow:policy`) for agents whose working directory contains an `openspec/` root. It restates these gates: clarify before proposing, confirm before creating a change, review the plan before apply, apply through the compact loop, validate before completion, review the commit before archive, and archive only on request. The rule is advisory and does not restrict tools.

Checkbox state changes go through `openspec_mark_task_done`; that keeps the cached progress and the source line consistent.

## Plugin constraints

- Plain ESM JavaScript with Node built-ins only. Runtime imports of `@deepseek-ai/*` break a linked profile install.
- `engines.dsh` pins the exact DSH runtime the plugin is verified against, and `engines.node` mirrors that runtime's Node floor; the floor is stated once in the `project-invariants` capability (`Runtime baseline`). When upgrading the DSH dependency, read the target version's `engines.node` first and update both fields together; a mismatch makes DSH skip the bundle.
- Tests and coverage run only on the primary Node major 24 and require a concrete version satisfying `engines.node`. Entrypoints check the `node` on PATH; they never call fnm, nvm, volta, or read `.nvmrc`. If the runtime does not qualify, they fail before starting tests.
- The OpenSpec CLI is an exact runtime dependency (`@fission-ai/openspec` 1.16.1, stated by the `project-invariants` `OpenSpec CLI pin` requirement). The plugin resolves only its own installed copy; do not reintroduce `cliPath`, PATH lookup, or project-local lookup.
- Keep tool descriptions and output schemas in `lib/tools/`, the projection and cache in `lib/state.js`, project initialization in `lib/init.js`, packaged-skill discovery in `lib/skills.js` and `lib/skill.js`, and the shipped skills in `skills/` in sync with behavior.
- Every packaged skill's `metadata.generatedBy` must equal `dsh-openspec-flow@<package.json version>`; the skill test enforces it.
- Keep the policy text in `lib/policy.js` consistent with the shipped skills. The policy is agent-scoped and must never be registered globally.
- Add a regression test for every behavior change. The tests use a fake Host context and the real bundled OpenSpec CLI.

## Evaluation harness

- The real-model harness lives in the separate `dsh-openspec-flow-eval` repository together with its spec, fixtures, offline tests and coverage gate. This repository no longer contains `eval/` or `eval:*` scripts.

## Verification

A change is complete when every task is checked, `openspec_inspect` with `action: "validate"` and `strict: true` passes, `npm test` passes on Node 24, and `npm run coverage:check` passes. The pre-push hook runs `npm run openspec:check` over every active change and main spec, and checks archived task completion, before coverage; `COVERAGE_SKIP=1` skips only coverage. A packaged skill that omits `strict: true` does not lower this repository's gate. The installed plugin is linked into the `web` profile; re-enable the `include:openspec-flow` entry or restart DSH to load changed Host code in a live session.
