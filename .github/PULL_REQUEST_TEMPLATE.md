## Linked issue

Closes #

## Change

- Change name under `openspec/changes/`:
- One-sentence summary:

## Root cause

What caused the behavior, and why this change addresses it.

## Scope

What changed. What did not change.

## Evidence

Commands and results from the commit in this pull request:

```text
npm test
npm run openspec:check
npm run verify
npm run test:lab -- --mock-only
```

- Commit SHA:
- Test result:
- Coverage summary:
- Lab result, when run:

## Risk and rollback

- Risk:
- Rollback:

## Checklist

- [ ] The pull request adds or updates an active change under `openspec/changes/`.
- [ ] Every task in the change's `tasks.md` is checked.
- [ ] `openspec validate <name> --strict` passes.
- [ ] No restricted path changed (`.githooks/`, `.github/workflows/`, `coverage.baseline.json`, `dist/`, `openspec/changes/archive/`, dependency fields, `package-lock.json`).
- [ ] No generated OpenSpec skill copy is committed.
- [ ] The change is not archived in this pull request.
- [ ] CI is green.

## Agent metadata (optional)

- GitHub handle:
- Agent, model or session:
