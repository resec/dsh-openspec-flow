# Tasks

## 1. Explicit worker home plumbing

- [x] 1.1 Add an optional sessions-root argument to `findSessionDir`, `readSessionEvents` and `loadSession`, and verify `node --test eval/test/eval-session.test.mjs` covers a lookup outside the process `DSH_HOME`.
- [x] 1.2 Give `dumpConfig` and `preflight` an environment overlay and pass it to the child `dsh`, and verify the profile tests still pass with an explicit environment.

## 2. Worker homes and pool

- [x] 2.1 Add `--concurrency` with a default of 1, create one marked DSH/agents home per worker (`-worker-<i>` for N greater than 1), preflight every worker with its own environment, and verify configuration and home tests cover the naming and cleanup.
- [x] 2.2 Replace the serial cell loop with a fixed worker pool over `planCells`, pass each cell's home to the runner, session lookup and session copy, and verify a fake matrix with concurrency 2 uses two homes and distinct child environments.

## 3. Reporting and cleanup

- [x] 3.1 Record worker, start, finish and wall time per run, add worker and wall-time columns to the report, and verify report tests assert the columns and stable ordering.
- [x] 3.2 Extend `eval:clean` to scan and remove marked worker homes, update `eval/README.md` with `--concurrency` guidance, and verify the documented command and cleanup behavior.

## 4. Validation

- [x] 4.1 Run `openspec_validate parallelize-eval-workers` and `npm run test:all`, and verify both pass.
