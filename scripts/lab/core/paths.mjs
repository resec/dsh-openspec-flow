/**
 * Fixed lab locations under the repository root.
 *
 * Every run-time path is derived from this module so the CLI, the cache and
 * the tests agree on one layout. Nothing here writes to the host home.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

/** Repository root. */
export const ROOT = fileURLToPath(new URL('../../../', import.meta.url))

/** Lab state root, ignored by git. */
export const LAB_ROOT = join(ROOT, '.cache', 'lab')

/** Cached DSH installations. */
export const DSH_CACHE = join(LAB_ROOT, 'dsh')

/** Playwright browser binaries. */
export const BROWSERS_PATH = join(LAB_ROOT, 'pw-browsers')

/** npm cache used by lab installs. */
export const NPM_CACHE = join(LAB_ROOT, 'cache', 'npm')

/** Per-run directories. */
export const RUNS = join(LAB_ROOT, 'runs')

/** Named POC/CLI instances. */
export const INSTANCES = join(LAB_ROOT, 'instances')

/** One-off experiments, never discovered by the test runner. */
export const EXPERIMENTS = join(LAB_ROOT, 'experiments')

/** Lock files for concurrent cache installs. */
export const LOCKS = join(LAB_ROOT, 'locks')

/**
 * Read the repository package manifest.
 * @returns parsed package.json.
 */
export function readPackage() {
  return JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
}
