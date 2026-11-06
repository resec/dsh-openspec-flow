# Design: separate evaluation tests

## Context

See [proposal.md](proposal.md) for motivation. The current `test/` directory mixes plugin runtime tests with nine harness tests. The harness tests import `eval/lib/*` and, through `eval/lib/fixtures.mjs`, the plugin's `installSkills`. That coupling is intentional for the plugin-arm fixture, so the tests remain integration tests rather than unit tests of the runtime.

## Goals / Non-Goals

**Goals**

- `npm test` runs only plugin runtime tests.
- `npm run test:eval` runs only the harness tests.
- `npm run test:all` runs both in one command.
- Document which command a change must run.

**Non-Goals**

- No change to harness behavior, fixtures or plugin runtime.
- No CI wiring; the commands stay manual.
- No attempt to remove the `installSkills` dependency.

## Decisions

### Move files instead of filtering by name

Node's test runner accepts directories, not exclusion globs. Moving the nine files to `eval/test/` gives each suite a stable root and keeps file discovery simple. The alternative — a shell `find` filter inside `npm test` — is less portable and easier to misread.

### Keep the harness under `eval/`

The tests stay next to the code they test, and the package `files` list still excludes the evaluation tooling from a published bundle. The moved files change only relative imports: `../eval/lib/*` becomes `../lib/*`, the sample session path drops the extra `eval/`, and `new URL('..', import.meta.url)` becomes `new URL('../..', import.meta.url)` for the repository root.

### Scripts express the three levels

- `test`: `node --test test/` — plugin runtime.
- `test:eval`: `node --test eval/test/` — harness.
- `test:all`: `node --test test/ eval/test/` — full check.

`test:all` passes both roots to one runner invocation instead of chaining two npm scripts, so the exit code and reporting stay uniform.

### The verification guidance names the suite

`AGENTS.md` will require `npm test` for ordinary plugin changes, `npm run test:eval` for changes under `eval/`, and `npm run test:all` for release-style checks. This keeps the repository's stated gate aligned with the files that actually changed.

### Correct the pending evaluation-harness scenario

`add-model-e2e-eval` is not archived yet, so its delta still says `node --test test/` runs the harness tests. After this move that sentence is false. The change updates that one scenario to `npm run test:eval` and leaves the rest of the pending delta intact.

## Risks / Trade-offs

- **A developer runs only `npm test` after touching `eval/`** → the verification guidance names `npm run test:eval`; `test:all` exists for release checks.
- **A moved test keeps a stale relative path** → each task runs the suite before moving on; the full suite runs at the end.
- **The pending evaluation change becomes inconsistent** → its scenario is corrected in the same change, and both changes are validated.
- **Future CI assumes `node --test test/` covers everything** → the README and AGENTS name `test:all` explicitly.

## Migration Plan

No runtime or data migration. Reverting the file move and the three scripts restores the previous behavior. No profile changes.

## Open Questions

None.
