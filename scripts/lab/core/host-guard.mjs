/**
 * Host configuration fingerprints.
 *
 * A lab run must not change the development host's profile or credentials.
 * Sessions, storages, logs and the generated `cordis.yml` are deliberately
 * excluded because DSH writes them while the host runs.
 */

import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, relative } from 'node:path'

/** File names that carry host configuration in a profile. */
const PROFILE_FILES = ['package.json', 'cordis.patch.yml', 'pnpm-lock.yaml']

/** Home-level configuration files. */
const HOME_FILES = ['.credentials.yaml', 'settings.yaml', 'settings.json']

/**
 * Hash the host configuration surface.
 * @param home - DSH home; defaults to the current user's.
 * @returns a map from relative path to sha256.
 */
export function hostFingerprint(home = join(homedir(), '.dsh')) {
  const result = {}
  const profiles = join(home, 'profiles')
  if (existsSync(profiles)) {
    for (const name of readdirSync(profiles)) {
      const directory = join(profiles, name)
      try {
        if (!statSync(directory).isDirectory()) continue
      } catch {
        continue
      }
      for (const file of PROFILE_FILES) {
        const path = join(directory, file)
        if (existsSync(path)) result[relative(home, path)] = hash(path)
      }
    }
  }
  for (const file of HOME_FILES) {
    const path = join(home, file)
    if (existsSync(path)) result[file] = hash(path)
  }
  return result
}

/**
 * Compare two fingerprints.
 * @param before - fingerprint before the run.
 * @param after - fingerprint after the run.
 * @returns changed, added and removed relative paths.
 */
export function diffFingerprints(before, after) {
  const changed = []
  const added = []
  const removed = []
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (!(key in before)) added.push(key)
    else if (!(key in after)) removed.push(key)
    else if (before[key] !== after[key]) changed.push(key)
  }
  return { changed: [...changed, ...added].sort(), removed: removed.sort() }
}

/**
 * Throw when a host fingerprint changed.
 * @param before - fingerprint before the run.
 * @param after - fingerprint after the run.
 * @returns nothing.
 */
export function assertHostUnchanged(before, after) {
  const { changed, removed } = diffFingerprints(before, after)
  if (changed.length > 0 || removed.length > 0) {
    throw new Error(
      `the development host changed during the lab run: ${[...changed, ...removed].join(', ')}`,
    )
  }
}

function hash(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}
