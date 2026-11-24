#!/usr/bin/env node
/**
 * Child-process test environment shared by the test entrypoints.
 *
 * A plain run points `NODE_COMPILE_CACHE` at an absolute directory under the
 * repository so the test process and every CLI child it starts reuse compiled
 * bytecode. A coverage run drops an inherited value because Node documents
 * that bytecode deserialised from the cache can make V8 coverage less precise.
 *
 * The path stays absolute: a relative value would resolve inside fixtures.
 *
 * The variables git injects into a hook it runs are dropped: a run started from
 * a `pre-push` hook in a linked worktree would otherwise hand every fixture's
 * `git init` the path of the hosting repository.
 */

import { mkdirSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** Absolute compile-cache directory shared by every plain test run. */
export const COMPILE_CACHE = join(ROOT, '.cache', 'node-compile')

/** Variables git sets for a process it starts; each one redirects a later `git` command. */
const GIT_INJECTED = [
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_OBJECT_DIRECTORY',
  'GIT_COMMON_DIR',
  'GIT_PREFIX',
  'GIT_ALTERNATE_OBJECT_DIRECTORIES',
]

/**
 * Build the environment for a plain test run.
 *
 * @param env - base environment, defaulting to the current process.
 * @returns a copy that carries the compile cache.
 */
export function plainTestEnv(env = process.env) {
  mkdirSync(COMPILE_CACHE, { recursive: true })
  return { ...env, NODE_COMPILE_CACHE: COMPILE_CACHE }
}

/**
 * Build the environment for a coverage run.
 *
 * @param env - base environment, defaulting to the current process.
 * @returns a copy without an inherited compile cache.
 */
export function coverageTestEnv(env = process.env) {
  const copy = { ...env }
  delete copy.NODE_COMPILE_CACHE
  return copy
}

/**
 * Resolve the temporary directory a child test process should inherit.
 *
 * The fixture root and the path a child process reports for the same directory
 * must be byte-equal. On macOS the default `/var/folders/...` is a symlink to
 * `/private/var/...`, and `getcwd` in the child resolves it, so the literal
 * value would not compare equal. A value that cannot be resolved is kept as
 * inherited rather than failing the run.
 *
 * @param env - base environment, defaulting to the current process.
 * @returns the canonical temporary directory.
 */
function canonicalTempDir(env = process.env) {
  const value = env.TMPDIR ?? tmpdir()
  try {
    return realpathSync.native(value)
  } catch {
    return value
  }
}

/**
 * Pick the environment for a run.
 *
 * Both runs leave out the git-injected variables; `GIT_CONFIG_GLOBAL` and the
 * other settings a test relies on are passed through.
 *
 * @param coverage - whether the run collects coverage.
 * @param env - base environment, defaulting to the current process.
 * @returns the environment for the child process.
 */
export function testEnvFor(coverage, env = process.env) {
  const child = coverage ? coverageTestEnv(env) : plainTestEnv(env)
  for (const name of GIT_INJECTED) delete child[name]
  return { ...child, TMPDIR: canonicalTempDir(env) }
}
