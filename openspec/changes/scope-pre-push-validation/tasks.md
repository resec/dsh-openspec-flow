# Tasks

## 1. Main-only validation gate

- [x] 1.1 Add `scripts/check-pre-push.mjs`: export a `main` that accepts a test-only `cli` path; the entrypoint calls `resolveBundledCli()` and no environment variable or argument selects the executable, so the hook path always uses the pinned copy. Run `openspec validate --specs --strict`, then `openspec validate --archived --strict`, then `openspec list --json`; allow only `in-progress` active changes, block `complete`, `no-tasks` and unknown statuses, and fail closed on spawn, exit, JSON or shape errors. Add `test/check-pre-push.test.mjs` with a fake CLI passed through `cli` for the exact argv sequence (no `--all` or `--changes`), the blocked messages with names and statuses including the archive-or-land wording, unknown status, validation failure, list failure and malformed output, plus real bundled-CLI cases in a temporary project for the in-progress pass and complete and task-less blocks, and a missing-CLI case asserting the resolver failure reported before any spawn; verify `node --test test/check-pre-push.test.mjs` passes.
- [x] 1.2 Add `"openspec:check:push": "node scripts/check-pre-push.mjs"` to `package.json` and keep `openspec:check` unchanged; verify the manifest value and run `node -e` to assert both commands.

## 2. Hook dispatch

- [x] 2.1 Change `.githooks/pre-push` to read the stdin ref lines once and run `npm run openspec:check:push` only when every read remote ref is `refs/heads/main`; run `npm run openspec:check` for another ref, a mixed set, or an absent or unreadable stream, keeping the lab and coverage order unchanged. Verify with `sh -n .githooks/pre-push` and the hook tests.
- [x] 2.2 Extend `test/hooks.test.mjs` with stdin cases for main-only, another ref, a mixed set and absent stdin, plus a main-only validation failure that stops before the lab gate; verify `node --test test/hooks.test.mjs` passes.
- [x] 2.3 Update the `scripts/install-hooks.mjs` message to describe the ref-aware validation; add or adjust an assertion in `test/hooks.test.mjs`; verify `node --test test/hooks.test.mjs` passes.

## 3. Documentation

- [x] 3.1 Update `AGENTS.md` and `README.md` so the pre-push description distinguishes the main-only scoped gate from the full CI and non-main check, and states that complete and task-less changes block a main push; verify the rendered commands and `grep` for both `openspec:check:push` and `openspec:check`.
- [x] 3.2 Update `docs/land-push.md` so its pre-push section says in-progress changes are ignored on a main push while complete or task-less changes block it, and its recovery text names an uncommitted parallel change directory and a `tasks.md` whose plain bullets parse as `no-tasks`; verify the section's commands and scope match the hook.

## 4. Integration verification

- [x] 4.1 While this task is still unchecked, run `npm run openspec:check:push` against the repository and verify it exits 0; then run `npm run check:requirement-length`, `npm run openspec:check`, `node --test test/hooks.test.mjs test/check-pre-push.test.mjs` and `npm run verify` on Node 24, verify every command exits 0, and verify `openspec_inspect` with `action: "validate"` and `strict: true` reports no findings.

## Workflow follow-up

- Commit the implementation, run the apply review, resolve every blocker and keep the review ready.
- Land the change, archive it, run `npm run openspec:check:push` after archive and verify it exits 0, then push the landed commits to `origin/main`.
