## Why

The pre-push hook currently runs `npm run openspec:check`, which validates every active change, so an unrelated in-progress change with a stale delta blocks a landed main push. Pull-request CI still needs that full validation because a pull request's own change is complete, so the check cannot simply skip complete changes everywhere.

## What Changes

- Make the pre-push hook decide by remote ref: a push targeting only `refs/heads/main` runs a scoped gate, while a push targeting another ref, a mixed set of refs, or no readable ref keeps the full `openspec:check`.
- Add `npm run openspec:check:push` and `scripts/check-pre-push.mjs` for the main-only gate: validate main specs and archived task completion strictly, then require every active change to report `in-progress`.
- Treat `complete` and `no-tasks` active changes as blocking on a main push; do not ignore a task-less change.
- Keep `npm run openspec:check` as the CI and non-main full check.
- Update the hook tests, the hook installer message, `AGENTS.md`, `README.md` and `docs/land-push.md`.

## Capabilities

### Modified Capabilities

- `development-workflow`: the `Strict artifact validation gate` requirement now defines main-only and other-push validation scopes, the allowed active-change status, and the unchanged lab and coverage ordering.

## Impact

- `.githooks/pre-push`, `package.json`
- New `scripts/check-pre-push.mjs` and `test/check-pre-push.test.mjs`
- `test/hooks.test.mjs`, `scripts/install-hooks.mjs`
- `AGENTS.md`, `README.md`, `docs/land-push.md`
- No dependency, schema or data change; CI, `scripts/push-landed.mjs`, the lab gate and the coverage stamp are unchanged.
