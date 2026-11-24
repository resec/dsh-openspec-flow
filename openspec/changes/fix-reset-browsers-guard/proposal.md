# Proposal

## Why

`--reset-browsers` deletes the resolved browser directory recursively. The resolution step returns `PLAYWRIGHT_BROWSERS_PATH` unchanged when it is absolute, so pointing it at a cache shared with the host or with other projects, such as `~/.cache/ms-playwright`, made bootstrap delete every browser in that directory. The deletion happened inside `prepareChromium` with no check of what it was removing, while the bootstrap requirement only leaves host state alone for shell configuration, global Git configuration and DSH profiles.

## What Changes

- Add a reset guard that only accepts a browser directory inside the repository root, which covers the default `.cache/lab/pw-browsers`, and refuses the repository root itself or any path outside it.
- Refuse before acquiring the install lock and before deleting anything, so a refused shared path is not touched and no lock file appears in it.
- Have `prepareChromium` run the guard whenever a reset is requested, and have bootstrap check the resolved path before any install step so `--reset-browsers` with a shared path exits nonzero with the refusal instead of after `npm ci`.
- Name the refused path, the reason and the explicit cleanup step in the message.
- State the confinement in `docs/apply-worktree-dev.md` and `CONTRIBUTING.md`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `contributor-workflow`: a new requirement confines a browser reset to the repository and refuses anything else with a message that names the path and the manual cleanup; the recovery requirement now removes only a repository-internal browser directory, and its explicit-path scenario is limited to a path inside the repository.

## Impact

- `scripts/worktree-env.mjs`: the reset guard and its call in `prepareChromium`.
- `scripts/bootstrap.mjs`: the early guard in `main` and the root passed by `runBrowserStep`.
- `test/worktree-env.test.mjs`, `test/bootstrap.test.mjs`: a refused shared path and a refused repository root keep their browsers, and the CLI exits nonzero.
- `docs/apply-worktree-dev.md`, `CONTRIBUTING.md`: the reset confinement and its refusal.
- No help-text, dependency, workflow, hook, coverage-baseline or `dist/` change; the default `.cache/lab/pw-browsers` reset is unchanged.
