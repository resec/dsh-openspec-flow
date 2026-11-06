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
import { join, resolve } from 'node:path'
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

/**
 * Resolve the DSH home at call time so a matrix can swap in an isolated home.
 * A blank or whitespace-only override is treated as unset.
 * @returns the absolute DSH home.
 */
export function dshHome() {
  const configured = process.env.DSH_HOME
  if (configured !== undefined && configured.trim() !== '') return resolve(configured)
  return join(homedir(), '.dsh')
}

/**
 * Root of persisted session logs under the current DSH home.
 * @returns the absolute sessions root.
 */
export function sessionsRoot() {
  return join(dshHome(), 'sessions')
}

/** Headless profile name used by every arm. */
export const PROFILE = 'headless'
