# Design: parallel evaluation workers

## Context

See [proposal.md](proposal.md). The previous change gave one matrix a private DSH home but still swapped `process.env` and ran cells sequentially. Parallelism needs two things at once: one profile per worker, and every home-dependent lookup addressed to the right worker.

## Goals / Non-Goals

**Goals**

- N workers run different cells at the same time, each with a distinct profile.
- Concurrency 1 remains byte-for-byte the previous behavior.
- Worker homes are always removed, including after a failure.

**Non-Goals**

- No change to model, prompt, fixtures or correctness gates.
- No cross-process worker supervisor; workers are async tasks in one Node process.
- No dynamic rate control; the operator chooses concurrency.

## Decisions

### Explicit worker environment instead of `process.env`

`runRound` already accepts an environment overlay, so each cell passes `DSH_HOME` and `DSH_AGENTS_HOME` explicitly. `profile.dumpConfig`/`preflight` take the same overlay. Session lookup takes the worker's sessions root instead of reading `process.env`.

The alternative — swapping `process.env` around each cell — cannot work with concurrent cells in one process. A child process per worker is heavier and would need a control protocol for fixtures, gates and reports. Explicit arguments keep the concurrency inside one process and preserve the existing cell function.

### Worker homes are sibling directories

For concurrency 1 the roots stay `eval/.dsh-home` and `eval/.agents-home`. For N workers they become `eval/.dsh-home-worker-0..N-1` and the matching agents roots. Every root carries the harness marker, so cleanup stays safe and `eval:clean` can scan the evaluation directory for marked `.dsh-home*` and `.agents-home*` entries.

### A fixed worker pool over ABBA-ordered cells

`planCells` already produces the ABBA order. A shared queue hands the next cell to whichever worker is free; each worker processes one cell at a time. With two workers the two arms of one replicate usually start together, but the report does not claim paired execution — it records the actual worker and wall time.

Workers are independent promises. `runCell` records its own errors, so one invalid cell does not reject the pool. Preflight runs for every worker before the queue starts; any preflight failure aborts before a model call and the `finally` removes all homes.

### Report adds worker and wall time

Each run record carries `worker`, `startedAt`, `finishedAt` and `wallMs`. The Markdown run table adds the worker and wall-time columns; the aggregate stays token-based because concurrency does not change token use. Rows are sorted by fixture order, replicate and arm after the pool drains, so a concurrent run does not make the report order nondeterministic.

## Risks / Trade-offs

- **Provider rate limits** → start with concurrency 2; retries are visible as `llm/retry` and invalid cells are retained.
- **More concurrent `dsh` processes** → each worker has its own home; disk is small because fixtures use hardlinked dependencies.
- **A slow cell occupies one worker** → the queue is dynamic; other workers keep taking cells.
- **A hard kill leaks worker homes** → markers plus `npm run eval:clean` scanning.
- **Concurrency changes wall time only** → report states this; token comparisons stay per-cell.

## Migration Plan

Default `--concurrency 1` keeps the existing one-home behavior. Higher values are opt-in. Stale worker homes are removed by the matrix or `eval:clean`; no data migration.

## Open Questions

None.
