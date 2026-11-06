/**
 * Stable paths for the evaluation harness.
 *
 * Every path is derived from this module's location so the harness works from
 * any working directory. Environment overrides exist for tests and for moving
 * the DSH home used by real runs.
 *
 * @module eval/lib/paths
 */

import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)

/** Absolute `eval/` directory. */
export const EVAL_ROOT = fileURLToPath(new URL('..', import.meta.url))

/** Fixture manifests and synthetic templates. */
export const FIXTURES_ROOT = join(EVAL_ROOT, 'fixtures')

/** Arm patch overlays. */
export const PATCHES_ROOT = join(EVAL_ROOT, 'patches')

/** Per-matrix output root. */
export const RUNS_ROOT = join(EVAL_ROOT, 'runs')

/** Cached generated assets such as official skills. */
export const CACHE_ROOT = join(EVAL_ROOT, '.cache')

let openspecBinPath

/**
 * Resolve the pinned OpenSpec CLI from the harness dependency tree.
 *
 * Resolution is lazy so help, list and dry-run paths work without an
 * installed CLI, and the first successful lookup is cached.
 *
 * @returns absolute path to the CLI entry.
 */
export function openspecBin({ resolveEntry = require.resolve, exists = existsSync } = {}) {
  if (openspecBinPath !== undefined) return openspecBinPath
  let entry
  try {
    entry = resolveEntry('@fission-ai/openspec')
  } catch (cause) {
    throw new Error(
      'OpenSpec CLI is not installed for the eval harness; run npm install in the harness repository',
      { cause },
    )
  }
  const binary = join(dirname(dirname(entry)), 'bin', 'openspec.js')
  if (!exists(binary)) {
    throw new Error(`OpenSpec CLI entry is missing: ${binary}`)
  }
  openspecBinPath = binary
  return openspecBinPath
}

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
