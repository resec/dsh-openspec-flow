# Adopt GitHub publishing for the plugin repository

## Why

The repository has no git remote, so its history exists only on this host and the plugin cannot be cloned, reviewed, or installed from source elsewhere. It also has no stated push convention, so archiving, committing, and pushing depend on each session's judgement.

## What Changes

- Configure `origin` as `git@github.com:resec/dsh-openspec-flow.git`.
- Publish `main` and set `origin/main` as its upstream.
- Record the publishing contract: the remote address, the `main` branch, and the archive-then-commit-then-push order.
- Document the contract in `README.md` and `AGENTS.md`, and state it as a requirement in the `development-workflow` spec.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `development-workflow`: adds a `Repository publishing` requirement covering the remote, the upstream branch, and the post-archive push, plus an `Archive precedes commit and push` requirement that fixes the delivery order.

## Impact

- Affected specs: `openspec/specs/development-workflow/spec.md`
- Affected files: `README.md`, `AGENTS.md`; `.git/config` gains the `origin` remote
- No plugin runtime behavior changes; no test changes required.
