#!/usr/bin/env node
/**
 * Run the instrumented test suites once and evaluate the coverage gate.
 *
 * This is the only command that runs tests for the coverage gate. It never
 * runs a plain test pass first.
 */

import { spawnSync } from 'node:child_process'
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { assertCurrentNode } from './node-version.mjs'
import { GateError, runGate } from './coverage-gate.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))

function parseArgs(argv) {
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

async function main() {
  const options = parseArgs(process.argv.slice(2))
  assertCurrentNode()
  rmSync(join(ROOT, '.coverage'), { recursive: true, force: true })
  const result = spawnSync(process.execPath, [join(ROOT, 'scripts', 'run-tests.mjs'), 'all'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, COVERAGE: '1' },
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1
    return
  }
  process.exitCode = await runGate({
    root: ROOT,
    mode: options.mode,
    base: options.base,
    updateBaseline: options.updateBaseline,
    allowLower: options.allowLower,
    reason: options.reason,
  })
}

try {
  await main()
} catch (error) {
  console.error(`coverage: ${error.message}`)
  console.error('Activate a Node 24 runtime that satisfies engines.node and retry; no version manager is invoked automatically.')
  process.exitCode = error.exitCode ?? 2
}
