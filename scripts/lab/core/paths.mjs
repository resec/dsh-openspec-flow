/**
 * Fixed lab locations under the repository root.
 *
 * Every run-time path is derived from this module so the CLI, the cache and
 * the tests agree on one layout. Nothing here writes to the host home.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { isAbsolute, join } from 'node:path'

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

/**
 * Resolve the npm cache for the lab.
 *
 * The ambient `npm_config_cache` is ignored: npm exports it to every lifecycle
 * script, and it names the host home cache, which a workspace-write sandbox
 * cannot write. `OPENSPEC_FLOW_NPM_CACHE` is the explicit override.
 * @param options - environment.
 * @returns the cache path.
 */
export function resolveNpmCache({ env = process.env } = {}) {
  return env.OPENSPEC_FLOW_NPM_CACHE ?? NPM_CACHE
}

/**
 * Resolve the Playwright browser path for one lab root.
 * @param options - lab root and environment.
 * @returns the absolute browser path.
 */
export function resolveBrowsersPath({ root = ROOT, env = process.env } = {}) {
  const value = env.PLAYWRIGHT_BROWSERS_PATH
  if (value === undefined || value.trim() === '') return join(root, '.cache', 'lab', 'pw-browsers')
  return isAbsolute(value) ? value : join(root, value)
}

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
