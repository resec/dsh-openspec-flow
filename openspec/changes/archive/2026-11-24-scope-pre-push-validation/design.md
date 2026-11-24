## Context

See `proposal.md` for motivation. The current hook runs `npm run openspec:check`, which is `openspec validate --all --strict && openspec validate --archived --strict`. `--all` includes every active change, so an unrelated in-progress delta can block a landed main push. The same command is the pull-request CI gate, where the pull request's own change is complete; moving the skip into `openspec:check` would therefore break CI.

The pinned CLI exposes `openspec list --json`, whose `changes[].status` is `in-progress`, `complete` or `no-tasks`, plus `openspec validate --specs --strict` and `openspec validate --archived --strict`. The pre-push hook receives stdin lines containing the local ref, local object, remote ref and remote object.

## Goals / Non-Goals

- Goal: a main-only push validates main specs and archived tasks and ignores unrelated in-progress changes.
- Goal: a main-only push rejects a complete or task-less active change, because neither belongs on main before archive.
- Goal: every other push keeps the existing full validation, and CI is unchanged.
- Goal: the lab and coverage ordering and the failure behavior remain unchanged.
- Non-goal: validating a broken in-progress delta earlier than today.
- Non-goal: changing `scripts/push-landed.mjs`, the lab harness or the coverage stamp.

## Decisions

### Decide by remote ref in the hook

The hook reads every stdin line once. It uses the scoped gate only when at least one line was read and every remote ref is `refs/heads/main`; a push to another ref, a mixed push, or unreadable or absent stdin uses the full `npm run openspec:check`.

This keeps the decision at the only place that knows the destination. An environment variable set by `push-landed` would miss a manual `git push origin main`; a global change to `openspec:check` would break CI.

Alternative: always run the scoped gate. Rejected because a normal pull-request branch carries a complete change and must still receive full validation locally.

### Use one testable script for the main-only gate

`scripts/check-pre-push.mjs` runs, in order:

1. `openspec validate --specs --strict`
2. `openspec validate --archived --strict`
3. `openspec list --json`, parsed in Node

A shell one-liner in `package.json` would be shorter, but a Node script exposes one place to fail closed on a spawn error, a nonzero exit, invalid JSON or an unexpected shape.

The script resolves the same pinned executable as the other repository gates through `resolveBundledCli()` and spawns it as `process.execPath [cli, ...]`, so a direct `node scripts/check-pre-push.mjs` works without relying on `npm`'s `PATH`. The executable path always calls the resolver; the script exports a `main` that accepts a test-only `cli` path, and no environment variable or command-line argument can select the executable on the hook path. Tests drive a fake executable through that parameter for failure paths and the real bundled CLI in a temporary project for the pass, complete and task-less paths; they assert the exact argv sequence and the blocked-change messages. A resolver failure reports the missing-CLI message before any spawn, while a spawn failure reports that a configured executable could not run.

Alternative: add the status check to `openspec:check`. Rejected because CI runs it on a branch whose active change is complete.

### Allow only `in-progress` on main

Every active change must report `in-progress`; `complete`, `no-tasks` and an unrecognized status block the push. `complete` means the change should have been landed or archived. `no-tasks` means the change has no tracked work yet and, per the confirmed scope, must not be silently ignored. Failing closed on an unknown status avoids treating a future status as safe.

### Fail closed and name the correction

A missing CLI, a failed validation, a nonzero listing command, invalid JSON or a malformed `changes` array exits nonzero before the lab gate. A blocked change message names each change and status and, for `complete`, the archive or land action. The hook's existing `|| exit $?` keeps the lab and coverage steps unreachable after a failure.

## Risks / Trade-offs

- An in-progress main-tree delta with a warning no longer blocks a main push; it is caught when it becomes complete, is archived, or is pushed as a branch. This is the requested trade-off.
- A deliberate complete or task-less active change now blocks a main push. The fix is to land or archive it, or finish its tasks; the hook must not offer a bypass.
- A push combining main and another ref takes the full path. This is slower but preserves validation for every active change in the push.
- Reading stdin consumes it. No later hook step uses stdin, and a missing or malformed stream falls back to the full check rather than skipping validation.
- The gate depends on the CLI's status strings. Real-CLI tests pin the `in-progress`, `complete` and `no-tasks` projections, and an unknown status fails closed rather than being ignored.

## Migration Plan

The change edits tracked files only. Existing installations already point `core.hooksPath` at `.githooks`, so the next push uses the new hook after the commit; no reinstall is required. Roll back by reverting the hook, the npm script, the new script and its tests, and the documentation edits; CI and data are unaffected.

## Open Questions

None. The task-less and non-main scopes are settled by the confirmed requirements.
