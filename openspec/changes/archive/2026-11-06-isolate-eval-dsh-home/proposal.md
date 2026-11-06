# Isolate the evaluation DSH home

## Why

Every evaluation run currently uses `~/.dsh`: it rewrites the `headless` profile's `cordis.yml`, writes sessions and logs, and reads the user's credentials. That pollutes the user's harness state and makes two workers unsafe because they share the same profile file.

## What Changes

- Create a private `DSH_HOME` and `DSH_AGENTS_HOME` under `eval/.dsh-home/` and `eval/.agents-home/` for every matrix.
- Generate the `headless` profile there: bundle list, plugin link, and the credentials/model patch.
- Copy `~/.dsh/.credentials.yaml` into the private home with owner-only permissions, and fail before any model call when it is missing.
- Resolve harness home paths lazily and pass both home variables to every `dsh` child process.
- Remove both private roots after the matrix, while keeping reports, run directories and copied session logs.
- Add `eval:clean` for stale roots and `--keep-home` for debugging.
- Update `eval/README.md`, `.gitignore`, configuration and tests.

## Capabilities

**New Capabilities**

- None.

**Modified Capabilities**

- `evaluation-harness` — adds the isolated-home requirement.

## Impact

- Changed: `eval/lib/paths.mjs`, `eval/lib/session.mjs`, `eval/lib/matrix.mjs`, `eval/run.mjs`, `eval/lib/config.mjs`, `package.json`, `eval/README.md`, `.gitignore`, new `eval/lib/dsh-home.mjs` and tests.
- Not changed: plugin runtime, fixtures, runner and metrics.
- Security: the private home holds a copy of the stored credentials; it is gitignored, mode-restricted and removed after the run.
- Behavior: user-level skills and `AGENTS.md` no longer enter the evaluation session because `DSH_AGENTS_HOME` is empty; this is intentional for a controlled comparison.
