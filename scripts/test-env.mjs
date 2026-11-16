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

import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

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
 * Pick the environment for a run.
 *
 * @param coverage - whether the run collects coverage.
 * @param env - base environment, defaulting to the current process.
 * @returns the environment for the child process.
 */
export function testEnvFor(coverage, env = process.env) {
  return coverage ? coverageTestEnv(env) : plainTestEnv(env)
}
