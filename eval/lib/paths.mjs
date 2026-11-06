/**
 * Stable paths for the evaluation harness.
 *
 * Every path is derived from this module's location so the harness works from
 * any working directory. Environment overrides exist for tests and for moving
 * the DSH home used by real runs.
 *
 * @module eval/lib/paths
 */

import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Absolute `eval/` directory. */
export const EVAL_ROOT = fileURLToPath(new URL('..', import.meta.url))

/** Absolute plugin repository root. */
export const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))

/** Fixture manifests and synthetic templates. */
export const FIXTURES_ROOT = join(EVAL_ROOT, 'fixtures')

/** Arm patch overlays. */
export const PATCHES_ROOT = join(EVAL_ROOT, 'patches')

/** Per-matrix output root. */
export const RUNS_ROOT = join(EVAL_ROOT, 'runs')

/** Cached generated assets such as official skills. */
export const CACHE_ROOT = join(EVAL_ROOT, '.cache')

/** Pinned OpenSpec CLI binary used by the official arm. */
export const OPENSPEC_BIN = join(REPO_ROOT, 'node_modules', '.bin', 'openspec')

/** DSH launcher; tests replace it with a fake executable. */
export const DSH_BIN = process.env.DSH_BIN ?? 'dsh'

/** DSH home that owns profiles and session logs. */
export const DSH_HOME = process.env.DSH_HOME ?? join(homedir(), '.dsh')

/** Root of persisted session logs. */
export const SESSIONS_ROOT = join(DSH_HOME, 'sessions')

/** Headless profile name used by every arm. */
export const PROFILE = 'headless'
