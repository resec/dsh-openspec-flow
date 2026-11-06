# Parallelize evaluation workers

## Why

The 30-cell matrix runs sequentially and takes about two hours even though most of each cell is waiting for the model. Now that the harness owns a private DSH home, each worker can have its own profile, so cells can run concurrently without sharing the profile file that made concurrency unsafe.

## What Changes

- Add `--concurrency <n>` with a default of 1.
- Create one private `DSH_HOME`, `DSH_AGENTS_HOME` and generated `headless` profile per worker (`eval/.dsh-home-worker-<i>` and the matching agents root).
- Pass both homes explicitly to every child `dsh` process, preflight every worker, and look up session logs under the worker's own sessions root; do not mutate `process.env`.
- Run a worker pool over the existing ABBA-ordered cells, with each worker processing one cell at a time.
- Record the worker index, start, finish and wall time for each run; keep the report rows stable.
- Remove every worker home after the matrix, and make `eval:clean` scan for stale marked homes.
- Update `eval/README.md`, configuration, tests and the report.

## Capabilities

**New Capabilities**

- None.

**Modified Capabilities**

- `evaluation-harness` — adds the concurrent-worker requirement.

## Impact

- Changed: `eval/lib/session.mjs`, `eval/lib/profile.mjs`, `eval/lib/matrix.mjs`, `eval/lib/config.mjs`, `eval/lib/dsh-home.mjs`, `eval/lib/report.mjs`, `eval/clean.mjs`, `eval/run.mjs`, tests and `eval/README.md`.
- Not changed: plugin runtime, fixtures, metrics and correctness gates.
- Behavior: `--concurrency 1` preserves the current serial, single-home run. Higher values shorten wall time but increase provider load and disk/CPU use; token cost is unchanged.
