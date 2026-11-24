/**
 * Registry of temporary fixture roots created by a test file.
 *
 * A test file that creates roots through `tempDir` removes them at file
 * teardown by registering `test.after(cleanupTempDirs)`. The registration
 * happens when the root is created, so a fixture that throws before the test
 * body's own cleanup runs still leaves nothing behind.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Roots created in this process and not yet removed. */
const CREATED = new Set()

/**
 * Create a temporary fixture root and record it for teardown.
 *
 * @param prefix - the directory name prefix, including its trailing separator.
 * @returns the absolute root path.
 */
export function tempDir(prefix) {
  const directory = mkdtempSync(join(tmpdir(), prefix))
  CREATED.add(directory)
  return directory
}

/**
 * Remove every recorded root and clear the registry. A second call is a no-op,
 * and a root a test removed on its own is skipped by the force delete. A root
 * that cannot be removed is reported without failing the file's teardown, so a
 * cleanup problem never turns a passing suite red.
 */
export function cleanupTempDirs() {
  try {
    for (const directory of CREATED) {
      try {
        rmSync(directory, { recursive: true, force: true })
      } catch (error) {
        console.error(`temporary fixtures: cannot remove ${directory}: ${error.message}`)
      }
    }
  } finally {
    CREATED.clear()
  }
}
