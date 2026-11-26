# Commit message and identity conventions

## Why

Two commit conventions this repository depends on were never written down. The `file-based-review-config` implementation landed as 11 commits authored `OpenSpec Flow <openspec-flow@example.com>`, an identity no git configuration defines, with Chinese messages while the change artifacts were English. Nothing in `AGENTS.md` or `CONTRIBUTING.md` forbade either, so an agent can repeat both.

## What Changes

- `CONTRIBUTING.md` requires every commit message, subject and body, to be written in English, even when the conversation, the change artifacts or an issue are written in another language.
- `AGENTS.md` restates the English rule in its `Commit conventions` section, so an agent working on this repository meets it without reading the contributor guide.
- `AGENTS.md` forbids inventing or overriding the commit identity: a commit created in the repository's working tree takes its author and committer from whatever `git config user.name` and `git config user.email` resolve, and no `-c user.name`, `-c user.email`, `--author`, `--reset-author`, `GIT_AUTHOR_*` or `GIT_COMMITTER_*` override is passed.
- `AGENTS.md` names the one sanctioned alternative: an automation identity the repository configures and records, never one supplied per command.
- The existing no-gate sentence in `AGENTS.md` moves from singular to plural and names script, hook and CI check, so it covers the task-group, finding, language and identity rules together.
- A `development-workflow` requirement records that the two documents state these rules and that no script, hook or CI check enforces them.

## Capabilities

### New Capabilities

None. The change writes documentation only.

### Modified Capabilities

- `development-workflow`: an ADDED requirement states that `CONTRIBUTING.md` and the `Commit conventions` section of `AGENTS.md` carry the two rules, that the author and committer come from the repository configuration, and that no script, hook or CI check enforces either rule.

## Impact

- `AGENTS.md` and `CONTRIBUTING.md`.
- After archive, `openspec/specs/development-workflow/spec.md` carries the new requirement.
- No code, API, dependency, schema or test change; `npm run verify` still gates the push.
- History written before the rule is not retrofitted: the 11 `OpenSpec Flow` commits stay as they are.
