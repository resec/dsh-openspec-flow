# Design

## Context

See [proposal.md](proposal.md) for the motivation and the spec deltas for the behavior contract. The current pieces that matter here:

- `scripts/bootstrap.sh` resolves a Node runtime host-first, otherwise downloads into the clone's `.cache/toolchain`; `scripts/bootstrap.mjs` then installs dependencies, hooks and Chromium, runs the lab doctor and tests, and writes nothing that names the tools it used.
- `scripts/worktree-env.mjs` already resolves `<main>/.cache/openspec-flow/shared` and shares the npm cache, pnpm store and Chromium directory, while keeping `node_modules` and `DSH_HOME` per worktree.
- `scripts/lab/core/doctor.mjs` checks `pnpm --version` from `PATH`; `scripts/lab/core/install.mjs` runs `dsh plugin add` and relies on DSH resolving `pnpm` from `PATH`.
- The published `@deepseek-ai/dsh@0.2.2-rc.2` package declares no pnpm version. Its source tag `dsh-v0.2.2-rc.2` declares `packageManager: pnpm@11.28.5`.
- `.githooks/pre-push` runs `npm run verify` with whatever `node` and `npm` are on the caller's `PATH`.

## Goals / Non-Goals

Goals:

- One toolchain pin for pnpm, read by bootstrap, the lab, CI and the docs.
- Shared, version-keyed buckets for the bootstrap-managed tools; a per-worktree record of what was chosen; a deterministic consumer path.
- A preparation step light enough to run when an apply worktree is created, with the existing creation rollback.

Non-goals:

- Changing what the pre-push hook verifies or when it runs. It keeps its current gates and only selects the recorded Node.
- Automatically bootstrapping from arbitrary scripts when no record exists.
- Preparing PR review worktrees.
- Fetching the pnpm declaration from the DSH source at runtime.
- Removing `pnpm/action-setup` from CI.

## Decisions

### Pin pnpm in a toolchain constant, not in a package-manager field

`scripts/toolchain.mjs` exports `PNPM_VERSION = '11.28.5'` and the bucket/CLI helpers. The constant is the single source for bootstrap, the lab, the workflow test and the documentation.

Alternatives:

- `package.json` `packageManager`: the user explicitly did not want it in this repository's manifest.
- pnpm as a devDependency: the version would come from the lockfile of each worktree, DSH resolves `pnpm` from `PATH`, and the pin would drift from the DSH target.
- A corepack wrapper keyed by pnpm, corepack and Node: correct but more machinery than the problem needs; the user rejected that complexity.
- Reading the DSH source declaration at runtime: the published package omits it, so this would add a network dependency and a tag-naming assumption to every bootstrap and CI run. The DSH upgrade procedure checks the target tag by hand instead.

### Record helpers ship with the plugin

`lib/toolchain-record.js` holds the record schema, the input fingerprint, staleness classification and per-worktree resolution, and ships through the existing `files: ["lib/**"]` entry. `scripts/toolchain.mjs` imports and re-exports it and adds the pin and the bucket/command helpers. The plugin's `lib/worktree/create.js` imports only the packaged module, so the tarball gate that forbids `scripts/` paths is not weakened and the installed plugin can validate a record. A packaging test asserts the tarball carries `lib/toolchain-record.js`.

### Version-keyed buckets under the existing shared root

| Artifact | Bucket | Key | Install |
| --- | --- | --- | --- |
| Node | `<shared>/toolchain/node/<version>/` | exact Node version | downloaded tarball, verified |
| pnpm | `<shared>/toolchain/pnpm/<version>/` | `PNPM_VERSION` | `npm install --prefix`, no corepack |
| Chromium | `<shared>/browsers/playwright-<version>/` | Playwright version | local `playwright/cli.js install chromium` |

Each bucket writes a completion marker only after a successful install and is written under a per-bucket lock. A host Node runtime is recorded with `source: "host"` and creates no bucket; pnpm is always bucketed so the lab and hook never depend on a host pnpm. Chromium is keyed by Playwright version because that is derivable from the lockfile before install and is the protocol-compatibility unit; the marker records the actual Chromium, headless-shell and ffmpeg revisions for verification. An explicit `PLAYWRIGHT_BROWSERS_PATH` still overrides the bucket everywhere, which is how CI keeps its own `.cache/lab/pw-browsers` path. The bucket lock is per bucket, so two Playwright versions can install at the same time while the same bucket serializes `init --browser` and bootstrap. `worktree-env.mjs` resolves the Playwright version from the lockfile, or from an installed `playwright-core`, so it can export the bucket path before `npm ci`; when neither exists and no explicit path is set, it fails with the install correction instead of guessing a version.

Alternatives:

- Per-worktree installs: duplicates hundreds of megabytes and makes the record's paths worktree-local.
- One mutable shared directory: a Playwright upgrade or `--reset-browsers` would affect other worktrees and could hand a worktree the wrong browser build.

### Record per worktree, strict when present

The record lives at `<worktree>/.cache/toolchain/manifest.json`, is written atomically, and names:

- `schema`, `worktree`, `platform`, `generatedAt`;
- `requirements` (Node range, primary major, pnpm pin);
- `inputs` (hashes of `package.json`, `package-lock.json`, `coverage.baseline.json`, `coverage.config.json`);
- `node` and `npm` (`path`, `version`, `source`);
- `pnpm` (`bucket`, `version`, `js`, `binDir`, `node`);
- `chromium` (`playwrightVersion`, `browsersPath`, `revisions`).

Resolution is per worktree for tool selection and never searches another worktree; bucket collection is the only cross-worktree reader. If a record is current, its paths and versions are authoritative and a missing path is an error; if no record exists (CI, a checkout that never bootstrapped), consumers keep the `PATH` behavior and check the pin; if it is stale, consumers fail with the correction for the changed input rather than using it or silently falling back.

### Deps-only mode

`scripts/bootstrap.sh --deps-only` resolves the shared root and Node, prepares the pnpm bucket, runs `npm ci` when `node_modules` is absent, prepares the Chromium bucket, writes the record, then attempts bucket collection. It skips hook installation, the lab doctor and tests. The full sequence keeps its current steps. Collection is best-effort after the record: a corrupt record in another worktree makes collection abort without deleting, reports that record, and leaves the preparation successful, so an unrelated worktree cannot roll back a new apply worktree.

The shell script resolves the shared root with `OPENSPEC_FLOW_SHARED_ROOT` or the main worktree from `git worktree list --porcelain`, mirroring `worktree-env.mjs`; a test binds the two resolutions. The Node bucket is only needed when the shell downloads a runtime, because a host runtime is used in place.

pnpm is installed with the resolved Node's npm into the bucket, using the shared npm cache, and is invoked as `<recorded node> <bucket>/node_modules/pnpm/bin/pnpm.mjs`. The bucket's `.bin` directory and the recorded Node's directory are what consumers put on `PATH`; the `pnpm` package has no dependencies or install scripts, so the bucket is a plain npm prefix. `scripts/activate.sh` reads the record's Node path first and falls back to the legacy `<worktree>/.cache/toolchain/node` symlink only for a checkout prepared before this change.

### Collection inside bootstrap

After writing the record, bootstrap enumerates `git worktree list --porcelain`, reads each worktree's record, and collects the referenced bucket paths. A bucket is deleted only when it is unreferenced, has no live lock, and is older than one hour. A corrupt record aborts the collection without deleting anything and is reported, but does not fail the preparation that triggered it; a missing worktree directory is reported and treated as no reference. `--no-gc` skips collection and `--gc-dry-run` reports candidates. The one-hour grace covers the window between choosing a bucket and writing the record.

Alternatives:

- A separate worktree command: the user wants bootstrap to own both preparation and collection.
- Age-only deletion: not safe with several worktrees and concurrent preparation.

### Consumers

- Lab doctor: if a current record exists, run the recorded pnpm with the recorded Node, require the pin, and check the recorded Chromium path when no explicit `PLAYWRIGHT_BROWSERS_PATH` is set; otherwise use `PATH` and the resolved bucket. A stale record fails with its correction; a missing recorded path asks for a new preparation; a missing browser correction names the resolved browser path rather than a fixed `.cache/lab` path.
- `dsh plugin add`: prepend the recorded `binDir` and Node directory to the child `PATH`; without a record leave the environment alone; a stale record fails with its correction. DSH resolves `pnpm` from `PATH`, so this is the only injection point.
- Pre-push hook: prepend the recorded Node directory to `PATH` before validation and verification; without a record leave `PATH` alone; a stale record fails with its correction. The hook does not prepare and does not fall back across worktrees.

### Apply worktree creation

`createOrReuseApplyWorktree` gains an injectable `prepareEnvironment` function. The real function spawns `<worktree>/scripts/bootstrap.sh --deps-only` with the worktree as cwd and inherited stdio, so the user sees progress. It runs after `moveSession` and before the state write, preserving the existing creation order; the session executes no command during preparation. A failure flows through the existing catch: move back, remove the worktree, delete only a branch this call created, release the lock, write no state, and throw an error naming the failed step.

Reuse validates the worktree's record through `lib/toolchain-record.js` and prepares only when the record is missing or stale. A non-git project keeps the single-tree path and runs no preparation. Tests inject a fake preparation; the real spawn is covered by the worktree creation test with a stub script.

The worktree's own bootstrap is used because the worktree is created at the seal commit, which includes this change. A branch created before this change has no `--deps-only`; the spawn fails with the usage text and creation rolls back with that diagnostic, rather than silently skipping preparation.

## Risks / Trade-offs

- [pnpm 12.6.0 hosts break] → the lab and CI must pass on 11.28.5 before merge; the upgrade is documented as a downgrade in the change.
- [First worktree creation blocks on `npm ci` and a Chromium download] → buckets are reused; progress is inherited; a failure rolls back; the flag is only used at creation, not on every entry.
- [GC races with a concurrent preparation] → per-bucket locks, a global collection lock and the one-hour grace; a corrupt record aborts without failing preparation.
- [The plugin cannot import a script helper] → the record helpers live in the packaged `lib/toolchain-record.js`; a packaging test keeps them in the tarball.
- [An unrelated corrupt record blocks a new worktree] → collection is best-effort after the record and never fails preparation.
- [A worktree's lock changes after a record is written] → the record is stale and the error tells the user to run `npm ci` and prepare again.
- [Host Node disappears or the shared root is deleted] → the record's path check fails with the preparation correction; nothing silently switches runtimes.
- [The worktree's seal commit predates `--deps-only`] → creation fails loudly with the usage diagnostic and rolls back.
- [Offline first preparation] → the pnpm bucket cannot be installed; bootstrap fails with the network error instead of using a host pnpm.

## Migration Plan

The change is additive until the consumer switch, so it can land in one change with ordered commits:

1. Add `lib/toolchain-record.js`, `scripts/toolchain.mjs`, the pin and their tests; no behavior change.
2. Add the buckets, `--deps-only`, the record and the activation path; the lab still uses `PATH`.
3. Switch the lab, hook and Chromium path to the record; run the lab and hook tests.
4. Add GC as best-effort after the record.
5. Prepare on worktree creation with the injectable seam.
6. Update the pin, CI, docs and the DSH upgrade procedure; run `npm run verify` and the lab.

Rollback: revert the commits; delete the ignored `.cache/toolchain` records and shared toolchain/browser buckets if a clean slate is wanted. No tracked data, dependency, lockfile, coverage baseline or `dist/` content changes. Until step 3, reverting is behavior-neutral; after step 3, reverting restores the `PATH` consumers.

## Open Questions

None.
