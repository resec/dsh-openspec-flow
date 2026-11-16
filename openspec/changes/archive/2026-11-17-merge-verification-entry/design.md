## Context

See [proposal.md](proposal.md) for the motivation. The current state that shapes the design:

- `package.json` scripts already separate `test` (`node scripts/run-tests.mjs plugin`) from `coverage:check` (`node scripts/coverage.mjs --check`).
- `scripts/coverage.mjs` spawns `scripts/run-tests.mjs all` with `COVERAGE=1` and exits on a test failure before evaluating the gate. Its `SCOPES` table has one scope, `plugin`, so `run-tests.mjs all` and `run-tests.mjs plugin` execute the same test files.
- `.githooks/pre-push` runs `npm run openspec:check` and then `npm run coverage:check`; `COVERAGE_SKIP=1` skips only the coverage step.
- `test/hooks.test.mjs` records the exact npm script names the hook invokes, so any hook change is test-visible.

## Goals / Non-Goals

**Goals**

- One documented command completes a change's executable verification.
- The command's single run proves both that the suite passes and that the coverage gate is green.
- Existing entrypoints (`coverage`, `coverage:check`, `coverage:baseline`, `COVERAGE=1 npm test`) keep working.

**Non-Goals**

- Changing test execution speed, the coverage thresholds, the lcov format, or the compile-cache decision.
- Removing `coverage:check` or renaming `scripts/coverage.mjs`.
- Folding strict OpenSpec validation into the same command.

## Decisions

### `verify` is a new alias, not a redefinition

Add `"verify": "node scripts/coverage.mjs --check"` to `package.json` scripts. The alternative was to make `coverage:check` the documented completion command without a new alias, but that name keeps suggesting it only measures coverage, which is the misreading that produced the duplicate runs. Renaming `coverage:check` instead would break README, the hook, and any local muscle memory for no added value.

Two scripts with the same body risk drifting apart later. The regression test pins both to the same command string, so a future edit of one without the other fails the suite.

### The alias calls the script directly

`verify` runs `node scripts/coverage.mjs --check` rather than `npm run coverage:check`, so it avoids an extra npm process and keeps the failure exit code transparent. npm forwards the exit code either way, but the direct form keeps the hook output free of a nested script banner.

### The hook calls `verify`

`.githooks/pre-push` changes its coverage line to `npm run verify`. The check performed is identical, but the hook and the documented completion command now share one name, so a reader cannot conclude the hook needs an extra `npm test` first. `COVERAGE_SKIP=1` keeps its meaning: validation still runs, coverage is skipped.

### Strict validation stays a separate gate

`openspec_inspect` with `strict: true` is a plugin tool call, not a shell command, and the hook already runs `npm run openspec:check` separately. Folding validation into `verify` would force the shell script to depend on the OpenSpec CLI in a second place and would blur the two failure modes. The spec continues to list strict validation and the verification command as two independent requirements of completion.

## Risks / Trade-offs

- [Two names for one behavior invite drift] → `test/hooks.test.mjs` asserts both `scripts.verify` and `scripts.coverage:check` equal `node scripts/coverage.mjs --check`.
- [The hook change silently alters a local gate] → the hook test already records the invoked script names, so the rename is asserted directly; the `COVERAGE_SKIP` tests keep covering the skip path.
- [`verify` looks like it includes strict validation] → README and `AGENTS.md` state what the command does and name strict validation as a separate step.
- [Readers keep running `npm test` before `verify`] → the spec scenario states the separate plain test pass is not required, and README's completion checklist names only `verify`.
- [A parallel change edits the same hook] → the active change `reuse-coverage-stamp-on-push` also rewrites `.githooks/pre-push` and `test/hooks.test.mjs`. This change fixes the command name as `npm run verify` and task 1.2 greps the hook for the absence of `coverage:check`; whichever change lands second must write its stamp fallback as `npm run verify` and rebase its hook assertion onto `['run openspec:check', 'run verify']`.

## Migration Plan

1. Add the script, update the hook and the installer message in one commit; the hook test changes with it.
2. Update README, `AGENTS.md` and the two upgrade guides; no historical document records are rewritten.
3. Rollback: revert the commit. `coverage:check` was never removed, so the previous wording and hook remain valid on their own.

## Open Questions

None.
