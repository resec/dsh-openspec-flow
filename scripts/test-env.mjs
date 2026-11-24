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
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/** Absolute compile-cache directory shared by every plain test run. */
export const COMPILE_CACHE = join(ROOT, '.cache', 'node-compile')

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
 * Resolve the host temporary directory and report whether that resolved.
 *
 * @param env - base environment, defaulting to the current process.
 * @returns the canonical directory and its resolution state.
 */
function resolveTempDir(env = process.env) {
  const value = env.TMPDIR ?? tmpdir()
  try {
    return { directory: realpathSync.native(value), resolved: true }
  } catch {
    return { directory: value, resolved: false }
  }
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
  return resolveTempDir(env).directory
}

/**
 * Create the temporary root that collects one run's fixtures.
 *
 * The root sits inside the canonical host temporary directory, so a caller
 * that chose `TMPDIR` keeps that location while its contents stay isolated
 * from earlier runs. When the inherited base cannot be resolved the run
 * proceeds without a root, matching the value the entrypoint always passed on.
 *
 * @param env - base environment, defaulting to the current process.
 * @returns the new root, or undefined when the base cannot be resolved.
 */
export function createRunTempDir(env = process.env) {
  const { directory, resolved } = resolveTempDir(env)
  if (!resolved) return undefined
  return mkdtempSync(join(directory, 'openspec-flow-run-'))
}

/**
 * Remove a run root. A missing or absent root is not an error.
 *
 * @param directory - the root to remove, or undefined.
 */
export function removeRunTempDir(directory) {
  if (directory === undefined) return
  rmSync(directory, { recursive: true, force: true })
}

/**
 * Pick the environment for a run.
 *
 * @param coverage - whether the run collects coverage.
 * @param env - base environment, defaulting to the current process.
 * @returns the environment for the child process.
 */
export function testEnvFor(coverage, env = process.env) {
  const child = coverage ? coverageTestEnv(env) : plainTestEnv(env)
  return { ...child, TMPDIR: canonicalTempDir(env) }
}
