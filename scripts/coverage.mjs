#!/usr/bin/env node
/**
 * Run the instrumented test suites once and evaluate the coverage gate.
 *
 * This is the only command that runs tests for the coverage gate. It never
 * runs a plain test pass first. A passing enforce run records the coverage
 * stamp the pre-push hook may reuse; a failing one clears it.
 */

import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { assertCurrentNode } from './node-version.mjs'
import { GateError, resolveMode, runGate } from './coverage-gate.mjs'
import { clearStampOnFailure, writeStamp } from './coverage-stamp.mjs'
import { DEFAULT_CONCURRENCY } from './run-tests.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

/**
 * @param argv - command-line arguments.
 * @returns parsed options.
 */
export function parseArgs(argv) {
  const options = {
    mode: undefined,
    base: 'origin/main',
    updateBaseline: false,
    allowLower: false,
    reason: null,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--check') options.mode = 'enforce'
    else if (arg === '--report-only') options.mode = 'report'
    else if (arg === '--update-baseline') options.updateBaseline = true
    else if (arg === '--allow-lower') options.allowLower = true
    else if (arg === '--base') options.base = argv[++index]
    else if (arg === '--reason') options.reason = argv[++index]
    else throw new GateError(`unknown argument: ${arg}`)
  }
  if (options.allowLower && !options.reason) throw new GateError('--allow-lower requires --reason')
  return options
}

/**
 * Record the stamp without letting a writer fault change the verdict.
 *
 * @param options - repository root and the merge base the gate resolved.
 */
function recordStamp({ root, base }) {
  try {
    const result = writeStamp({ root, base })
    if (!result.written) process.stderr.write(`coverage stamp: ${result.reason}\n`)
  } catch (error) {
    process.stderr.write(`coverage stamp: ${error.message}\n`)
  }
}

/**
 * @param options - repository root, the effective mode and the baseline flag.
 */
function clearStamp({ root, mode, updateBaseline }) {
  try {
    const result = clearStampOnFailure({ root, mode, updateBaseline })
    if (result.cleared) process.stderr.write(`coverage stamp: ${result.reason}\n`)
  } catch (error) {
    process.stderr.write(`coverage stamp: ${error.message}\n`)
  }
}

/**
 * Run the instrumented suite once, then evaluate the gate and maintain the stamp.
 *
 * Preflight and argument failures run before the suite and before any stamp
 * decision, so they leave a recorded stamp untouched.
 *
 * @param options - repository root, CLI arguments and the Node version to check.
 * @returns process exit code.
 */
export async function runVerification({ root = ROOT, argv = process.argv.slice(2), version = process.version } = {}) {
  const options = parseArgs(argv)
  assertCurrentNode({ root, version })
  const mode = resolveMode(root, options.mode)
  rmSync(join(root, '.coverage'), { recursive: true, force: true })
  const result = spawnSync(process.execPath, [
    join(root, 'scripts', 'run-tests.mjs'),
    'all',
    '--',
    `--test-concurrency=${DEFAULT_CONCURRENCY}`,
  ], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, COVERAGE: '1' },
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    clearStamp({ root, mode, updateBaseline: options.updateBaseline })
    return result.status ?? 1
  }
  let code
  try {
    code = await runGate({
      root,
      mode: options.mode,
      base: options.base,
      updateBaseline: options.updateBaseline,
      allowLower: options.allowLower,
      reason: options.reason,
      onEnforcePass: ({ base }) => recordStamp({ root, base }),
      onEnforceFail: () => clearStamp({ root, mode, updateBaseline: options.updateBaseline }),
    })
  } catch (error) {
    clearStamp({ root, mode, updateBaseline: options.updateBaseline })
    throw error
  }
  return code
}

async function main() {
  try {
    process.exitCode = await runVerification()
  } catch (error) {
    console.error(`coverage: ${error.message}`)
    console.error('Activate a Node 24 runtime that satisfies engines.node and retry; no version manager is invoked automatically.')
    process.exitCode = error.exitCode ?? 2
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main()
}
