# Spec Delta

## MODIFIED Requirements

### Requirement: Lab and bootstrap honor the environment

The lab and bootstrap SHALL resolve their npm cache from `OPENSPEC_FLOW_NPM_CACHE` when set, else `.cache/lab/cache/npm` (lab) or `.cache/npm` (bootstrap), and SHALL NOT use `npm_config_cache` for that choice. The worktree environment SHALL export `OPENSPEC_FLOW_NPM_CACHE` and `npm_config_cache` with the shared npm cache. The lab and bootstrap SHALL use `PLAYWRIGHT_BROWSERS_PATH` for Chromium when set. Bootstrap SHALL NOT overwrite an explicitly set browser path.

#### Scenario: The lab uses the shared caches

- **WHEN** the lab runs with the exported environment
- **THEN** its npm cache and browser path are the exported shared paths

#### Scenario: Bootstrap uses the shared browser path

- **WHEN** bootstrap runs with `PLAYWRIGHT_BROWSERS_PATH` set
- **THEN** it installs or verifies the browser at that path instead of the version bucket

#### Scenario: Bootstrap resolves the browser path once

- **WHEN** bootstrap runs with `PLAYWRIGHT_BROWSERS_PATH` set
- **THEN** its presence check, `--reset-browsers` and installer all use the resolved path

#### Scenario: The lab consumes the resolved browser and npm paths

- **WHEN** the lab starts with a custom root and the exported environment
- **THEN** it uses the exported browser and npm cache paths instead of recomputing its own defaults

#### Scenario: A custom lab root keeps its default without the environment

- **WHEN** the lab starts with a custom root and no `PLAYWRIGHT_BROWSERS_PATH`
- **THEN** it uses the worktree's Playwright-version bucket, not a root-local default

#### Scenario: Unset variables keep the old defaults

- **WHEN** the lab or bootstrap runs without the exported variables
- **THEN** it uses its existing npm-cache defaults and the Playwright-version browser bucket

#### Scenario: An npm script cache is ignored

- **WHEN** the lab runs with `npm_config_cache` set by an npm script and `OPENSPEC_FLOW_NPM_CACHE` unset
- **THEN** it uses `.cache/lab/cache/npm` and not the `npm_config_cache` path

#### Scenario: Bootstrap ignores the ambient npm cache

- **WHEN** bootstrap runs with `npm_config_cache` set and `OPENSPEC_FLOW_NPM_CACHE` unset
- **THEN** it uses `.cache/npm` and not the `npm_config_cache` path

#### Scenario: Bootstrap feeds its npm children the resolved cache

- **WHEN** bootstrap resolves the npm cache
- **THEN** `npm ci`, `npm run verify` and `npm run test:lab` receive `OPENSPEC_FLOW_NPM_CACHE` and `npm_config_cache` with that path

#### Scenario: The printed environment names the cache variables

- **WHEN** the worktree environment is printed
- **THEN** it exports `OPENSPEC_FLOW_NPM_CACHE` and `npm_config_cache` pointing at `<shared>/npm`

### Requirement: Concurrent worktree preparation

Chromium preparation SHALL serialize through one lock per browser bucket under the shared root, used by `init --browser` and bootstrap. A waiter SHALL wait and recheck, then reuse a browser the holder installed; it SHALL report the owner only on timeout. A dead owner's lock SHALL be reclaimable. Concurrent worktrees SHALL keep `node_modules`, `DSH_HOME` and output separate; lab ports stay OS-assigned.

#### Scenario: Two worktrees prepare Chromium concurrently

- **WHEN** two worktrees prepare the same Playwright-version bucket at the same time
- **THEN** one installs under that bucket's lock and the other waits, rechecks and finishes with the same usable browser path

#### Scenario: Different Chromium buckets prepare concurrently

- **WHEN** two worktrees prepare different Playwright-version buckets at the same time
- **THEN** each uses its own bucket lock and neither waits for the other

#### Scenario: Bootstrap and init share the lock

- **WHEN** bootstrap and `init --browser` prepare the same bucket at the same time
- **THEN** both use that bucket's lock and only one Chromium installation runs

#### Scenario: A reset waits for the lock

- **WHEN** bootstrap runs `--reset-browsers` while another preparation holds the bucket lock
- **THEN** the reset waits for the lock before checking and removing that bucket

#### Scenario: A dead owner is reclaimed

- **WHEN** the lock records a process that no longer exists
- **THEN** the next preparation reclaims the lock and installs the browser

#### Scenario: A timeout names the owner

- **WHEN** a live owner holds the lock past the wait timeout
- **THEN** the waiter fails and names the owner instead of deleting the lock

#### Scenario: check reports a held lock

- **WHEN** `check` runs while another process holds a bucket lock
- **THEN** it reports the lock and its owner without removing it

#### Scenario: Concurrent tests keep their own state

- **WHEN** two worktrees run their test commands at the same time
- **THEN** each uses its own `node_modules`, `DSH_HOME` and output directory

#### Scenario: Lab ports stay OS-assigned

- **WHEN** two lab runs start concurrently
- **THEN** their web and mock servers bind OS-assigned ports and do not require a worktree port derivation

### Requirement: Developer-facing environment documentation

The repository SHALL document the environment command, the shared and per-worktree boundaries, the Playwright-version browser bucket with its explicit-path override and per-bucket lock, the record's browser path, concurrent preparation and rollback in `docs/apply-worktree-dev.md`. It SHALL link that document from `docs/lab.md`, `CONTRIBUTING.md`, `AGENTS.md` and `README.md`, and SHALL update `docs/lab.md` and `CONTRIBUTING.md` where they name the old browser install and reset paths.

#### Scenario: A developer follows the documented command

- **WHEN** a developer runs the documented `source` command in an apply worktree
- **THEN** the printed npm, pnpm, Chromium and `DSH_HOME` values match the documented boundaries

#### Scenario: The documentation is linked

- **WHEN** a reader opens the lab, contribution, agent or README document
- **THEN** it links to `docs/apply-worktree-dev.md`

#### Scenario: Bootstrap documents the resolved browser path

- **WHEN** a reader opens `docs/lab.md` or `CONTRIBUTING.md`
- **THEN** the browser install and reset text names the explicit `PLAYWRIGHT_BROWSERS_PATH` override and the Playwright-version bucket as the default

#### Scenario: The bucket and record are documented

- **WHEN** a reader opens `docs/apply-worktree-dev.md`
- **THEN** it documents the per-bucket lock and the record's browser path

#### Scenario: Rollback is documented

- **WHEN** a developer stops using the environment
- **THEN** the document states that removing the exported variables restores the old defaults and that deleting the shared root does not affect source, records or worktrees

## ADDED Requirements

### Requirement: Chromium is prepared in a Playwright-version bucket

Chromium SHALL be prepared in `<shared>/browsers/playwright-<version>/`, keyed by the worktree's resolved Playwright version, when `PLAYWRIGHT_BROWSERS_PATH` is unset; the worktree environment SHALL export that path and an explicit value SHALL still win. The bucket SHALL carry a completion marker with the Chromium, headless-shell and ffmpeg revisions, and `--reset-browsers` SHALL reset only that bucket. The lab SHALL use a current record's browser path, else the resolved bucket.

#### Scenario: The default bucket is version-keyed

- **WHEN** no explicit browser path is set and the worktree resolves Playwright 1.65.1
- **THEN** the browser path ends with `browsers/playwright-1.65.1`

#### Scenario: An explicit browser path wins

- **WHEN** `PLAYWRIGHT_BROWSERS_PATH` is set
- **THEN** the lab, bootstrap and `init --browser` use it instead of the bucket

#### Scenario: The printed environment names the bucket

- **WHEN** the worktree environment is printed without an explicit browser path
- **THEN** `PLAYWRIGHT_BROWSERS_PATH` names the worktree's Playwright-version bucket

#### Scenario: The marker records the revisions

- **WHEN** the bucket is installed
- **THEN** its completion marker records the Chromium, headless-shell and ffmpeg revisions from the local Playwright package

#### Scenario: A reset clears only the current bucket

- **WHEN** `--reset-browsers` runs for one Playwright version
- **THEN** other Playwright-version buckets remain

#### Scenario: The lab uses the recorded browser path

- **WHEN** the current worktree has a record and no explicit browser path is set
- **THEN** the lab checks and runs the recorded Chromium path

#### Scenario: The lab without a record uses the resolved bucket

- **WHEN** no record exists and no explicit browser path is set
- **THEN** the lab uses the Playwright-version bucket

#### Scenario: An unresolvable Playwright version fails

- **WHEN** the worktree has no resolved Playwright version and no explicit browser path
- **THEN** preparation fails and names the install or preparation correction
