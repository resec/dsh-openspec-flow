# apply-worktree-environment delta

## MODIFIED Requirements

### Requirement: Lab and bootstrap honor the environment

The lab and bootstrap SHALL resolve their npm cache from `OPENSPEC_FLOW_NPM_CACHE` when set, else `.cache/lab/cache/npm` (lab) or `.cache/npm` (bootstrap), and SHALL NOT use `npm_config_cache` for that choice. The worktree environment SHALL export `OPENSPEC_FLOW_NPM_CACHE` and `npm_config_cache` with the shared npm cache. The lab and bootstrap SHALL use `PLAYWRIGHT_BROWSERS_PATH` for Chromium and keep defaults when unset. Bootstrap SHALL NOT overwrite an explicitly set browser path.

#### Scenario: The lab uses the shared caches

- **WHEN** the lab runs with the exported environment
- **THEN** its npm cache and browser path are the exported shared paths

#### Scenario: Bootstrap uses the shared browser path

- **WHEN** bootstrap runs with `PLAYWRIGHT_BROWSERS_PATH` set
- **THEN** it installs or verifies the browser at that path instead of the worktree-local default

#### Scenario: Bootstrap resolves the browser path once

- **WHEN** bootstrap runs with `PLAYWRIGHT_BROWSERS_PATH` set
- **THEN** its presence check, `--reset-browsers` and installer all use the resolved path

#### Scenario: The lab consumes the resolved browser and npm paths

- **WHEN** the lab starts with a custom root and the exported environment
- **THEN** it uses the exported browser and npm cache paths instead of recomputing its own defaults

#### Scenario: A custom lab root keeps its default without the environment

- **WHEN** the lab starts with a custom root and no `PLAYWRIGHT_BROWSERS_PATH`
- **THEN** it uses `<root>/.cache/lab/pw-browsers`, not the repository root's default

#### Scenario: Unset variables keep the old defaults

- **WHEN** the lab or bootstrap runs without the exported variables
- **THEN** it uses its existing worktree-local cache and browser defaults

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
