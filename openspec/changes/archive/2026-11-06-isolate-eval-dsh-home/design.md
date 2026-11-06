# Design: isolated evaluation DSH home

## Context

See [proposal.md](proposal.md). Today the harness inherits `~/.dsh`: `prepareProfile` rewrites the `headless` profile's `cordis.yml`, sessions go to `~/.dsh/sessions`, logs to `~/.dsh/logs`, and the account route reads `~/.dsh/.credentials.yaml`. Two workers cannot share that profile safely because the official and plugin arms apply different patches.

## Goals / Non-Goals

**Goals**

- No writes under `~/.dsh` during a matrix.
- One command creates, uses and removes the private home.
- The private home is complete enough for `dsh --profile headless` to boot with the plugin and stored credentials.

**Non-Goals**

- No concurrent-worker implementation yet; each matrix gets one home.
- No migration of old sessions or reports.
- No copying of user-level skills or `AGENTS.md`; the controlled home starts empty.
- No change to fixtures, runner, metrics or the plugin runtime.

## Decisions

### Private roots under the evaluation directory

The harness owns `eval/.dsh-home/` and `eval/.agents-home/`. Both are gitignored. A marker file in each root identifies it as harness-owned; a custom root without the marker is refused rather than deleted. This makes the default cleanup safe and leaves `--keep-home` useful for debugging.

### Generate the profile instead of copying `~/.dsh`

The profile is written from code:

- `profiles/headless/package.json` — bundles `@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-headless`, `dsh-openspec-flow`; a `link:` dependency on this repository.
- `profiles/headless/node_modules/dsh-openspec-flow` — a symlink to this repository.
- `profiles/headless/cordis.patch.yml` — restore `credentials`, `authorization`, `deepseek-account`, and pin `deepseek-account/deepseek-flash` with `reasoningEffort: high`.

Copying the user's profile would carry generated state and the user's settings, and would hide the profile contract. Generating it makes the precondition explicit and lets a clone reproduce it.

### Credentials are copied, restricted and deleted

The source default is `~/.dsh/.credentials.yaml`; `--source-home` changes the source. The copy is written with mode `0600` before any model call. A missing source aborts the matrix before the profile is used for a model. The copy is deleted with the private home; the report never includes its contents.

### Empty `DSH_AGENTS_HOME`

The agents root is created empty, which drops user-level skills and `AGENTS.md` from the evaluation session. This is intentional: a controlled comparison should not depend on the operator's personal instructions. The README records the consequence, and both arms lose the same context.

### Lazy home resolution and explicit child environment

`paths.mjs` stops exporting a home constant and exposes `dshHome()` and `sessionsRoot()` computed from the current environment. `runMatrix` creates the home, sets `DSH_HOME` and `DSH_AGENTS_HOME` in the process, runs preflight, cells and report, then restores the previous values in `finally` and removes the roots unless `--keep-home` is set. Every `dsh` child inherits the variables; `dumpConfig` and `runRound` already inherit the process environment.

The alternative — setting the variables only in the child spawn options — would leave session-log lookup and preflight pointed at the default home, because they read the same paths. One process-wide swap at the matrix boundary keeps them consistent.

### Cleanup is best-effort under interruption

`finally` covers normal completion and thrown errors. A hard kill can leave the private roots behind; the marker makes `npm run eval:clean` safe to run later. The matrix removes the roots only after the report is written.

## Risks / Trade-offs

- **A credentials copy lands in the workspace** → gitignored, mode `0600`, removed after the run; `eval:clean` exists for crashes.
- **Dropping user skills changes results compared with earlier runs** → documented; both arms lose the same skills; rerun the baseline if needed.
- **Generated profile drifts from the DSH profile contract** → preflight runs `--dump-config` and the model row is checked; the README records the required bundles.
- **`process.env` is process-wide** → matrix runs are sequential; tests inject home helpers and restore the environment.
- **Cleanup deletes a custom path** → marker check refuses unmarked roots; default roots are under `eval/`.

## Migration Plan

No runtime or data migration. Existing reports and sessions remain where they are. Set `--keep-home` for one run only when debugging; otherwise cleanup is automatic. `npm run eval:clean` removes stale marked roots.

## Open Questions

None. Per-worker homes for concurrent matrices are a later change.
