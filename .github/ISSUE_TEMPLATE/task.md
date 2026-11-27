---
name: Contributor task
about: A scoped repair or review task with acceptance criteria
title: "task: "
labels: ""
assignees: ""
---

## Summary

One paragraph describing the change and why it is needed.

## Source

- Finding, review comment or issue:
- Commit or file:

## Reproduction

Commands that demonstrate the current behavior.

```sh
# commands
```

## Expected result

The observable behavior after the task.

## Acceptance commands

Commands that must pass before the pull request is ready.

```sh
npm test
npm run openspec:check
npm run check:requirement-length
npm run verify
```

## Scope

Allowed paths:

Forbidden paths:

## Evidence

List the output the pull request should include: command, result, commit SHA, and coverage summary when `npm run verify` runs.

## Agent brief

- Goal:
- Constraints:
- Out of scope:
- Change name to create:

Before opening this issue, read [CONTRIBUTING.md](../../CONTRIBUTING.md) for the CLI-only workflow and evidence requirements.
