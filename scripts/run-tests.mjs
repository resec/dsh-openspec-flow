#!/usr/bin/env node
/**
 * Test entrypoint that works on Node 24.
 *
 * Node 24 treats a directory passed to `--test` as a module, so the wrapper
 * enumerates test files itself. It also owns coverage argument order: on
 * Node 24 coverage flags must precede the test file paths.
 */

import { mkdirSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { assertCurrentNode } from './node-version.mjs'
import { testEnvFor } from './test-env.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const COVERAGE_ENABLED = process.env.COVERAGE === '1' || process.env.COVERAGE === 'true'
/** The test-file concurrency a plain run uses when the caller supplies none. */
export const DEFAULT_CONCURRENCY = 8

const SCOPES = {
  plugin: {
    testDir: 'test',
    include: ['lib/**', 'index.js'],
    exclude: ['test/**'],
    lcov: '.coverage/plugin.info',
  },
}

function listTests(directory) {
  return readdirSync(join(ROOT, directory))
    .filter((name) => name.endsWith('.test.mjs'))
    .sort()
    .map((name) => join(directory, name))
}

/**
 * Build the `node --test` argv for one scope.
 *
 * The default concurrency is added only when the passthrough carries no
 * `--test-concurrency=` entry, so exactly one flag reaches the runner and a
 * caller's value wins.
 * @param options - scope, coverage and the arguments after `--`.
 * @returns the argv for `node --test`.
 */
export function buildTestArgs({ scope = 'plugin', coverage = false, extra = [] } = {}) {
  const definition = SCOPES[scope]
  if (definition === undefined) throw new Error(`unknown scope: ${scope}`)
  const files = listTests(definition.testDir)
  if (files.length === 0) {
    throw new Error(`no test files found under ${definition.testDir}`)
  }
  const args = ['--test']
  if (coverage) {
    args.push('--experimental-test-coverage')
    for (const pattern of definition.include) args.push(`--test-coverage-include=${pattern}`)
    for (const pattern of definition.exclude) args.push(`--test-coverage-exclude=${pattern}`)
    args.push('--test-reporter=spec', '--test-reporter-destination=stdout')
    args.push('--test-reporter=lcov', `--test-reporter-destination=${definition.lcov}`)
  }
  args.push(...extra)
  if (!extra.some((argument) => argument.startsWith('--test-concurrency='))) {
    args.push(`--test-concurrency=${DEFAULT_CONCURRENCY}`)
  }
  args.push(...files)
  return args
}

/**
 * Run one scope.
 *
 * The child environment comes from the shared test-env module, so the plain
 * and scoped entrypoints cannot drift apart on the compile cache.
 *
 * @param scope - scope name from `SCOPES`.
 * @param coverage - whether this run collects coverage.
 * @param extra - extra arguments forwarded after the test paths.
 * @returns the child exit status.
 */
function runScope(scope, coverage, extra = []) {
  if (coverage) mkdirSync(join(ROOT, '.coverage'), { recursive: true })
  const args = buildTestArgs({ scope, coverage, extra })
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: testEnvFor(coverage),
  })
  if (result.error) throw result.error
  return result.status ?? 1
}

function main() {
  const raw = process.argv.slice(2)
  const separator = raw.indexOf('--')
  const own = separator === -1 ? raw : raw.slice(0, separator)
  const extra = separator === -1 ? [] : raw.slice(separator + 1)
  const coverage = COVERAGE_ENABLED || own.includes('--coverage')
  const scope = own.find((argument) => !argument.startsWith('-')) ?? 'all'
  const unknown = own.filter((argument) => argument.startsWith('-') && argument !== '--coverage')
  if (unknown.length > 0) {
    throw new Error(`unknown arguments: ${unknown.join(' ')}`)
  }
  if (scope !== 'all' && !Object.hasOwn(SCOPES, scope)) {
    throw new Error(`unknown scope: ${scope}; use plugin or all`)
  }

  assertCurrentNode()

  const scopes = scope === 'all' ? Object.keys(SCOPES) : [scope]
  let failed = false
  for (const name of scopes) {
    const status = runScope(name, coverage, extra)
    if (status !== 0) failed = true
  }
  process.exitCode = failed ? 1 : 0
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    main()
  } catch (error) {
    console.error(`test entrypoint: ${error.message}`)
    console.error('Activate a Node 24 runtime that satisfies engines.node and retry; no version manager is invoked automatically.')
    process.exit(error.exitCode ?? 2)
  }
}
