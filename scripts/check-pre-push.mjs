#!/usr/bin/env node
/**
 * Main-branch pre-push OpenSpec gate.
 *
 * A push to main may carry unrelated in-progress changes, so validating every
 * active change there would let another change's stale delta block the push.
 * Pull-request CI still validates every active change because its own change
 * is complete, so this scope lives only in the main-only hook path.
 *
 * The gate validates main specs and archived task completion, then requires
 * every active change to be `in-progress`. A complete, task-less or unknown
 * active change blocks the push before the lab and coverage gates.
 */

import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { resolveBundledCli } from '../lib/openspec.js'

const ALLOWED_STATUS = 'in-progress'
const VALIDATIONS = [
  ['validate', '--specs', '--strict'],
  ['validate', '--archived', '--strict'],
]

/**
 * Run one OpenSpec CLI command.
 *
 * @param cli - absolute path to the bundled CLI entry.
 * @param args - arguments after the CLI entry.
 * @param options - working directory and whether stdout/stderr should be captured.
 * @returns the spawn result.
 */
export function runCli(cli, args, { cwd = process.cwd(), capture = false } = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : ['ignore', 'inherit', 'inherit'],
  })
}

/**
 * Format the correction for one blocked active change.
 *
 * @param status - the reported active-change status.
 * @returns the actionable sentence for the status.
 */
export function correctionFor(status) {
  if (status === 'complete') return 'land or archive it before pushing main'
  if (status === 'no-tasks') return 'add tracked checkbox tasks or archive it before pushing main'
  return 'finish it before pushing main'
}

/**
 * Read and validate the active-change projection.
 *
 * @param raw - stdout of `openspec list --json`.
 * @returns the parsed active changes.
 * @throws Error when the projection is not a changes array.
 */
export function parseActiveChanges(raw) {
  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error('openspec list --json returned invalid JSON')
  }
  if (parsed === null || typeof parsed !== 'object' || !Array.isArray(parsed.changes)) {
    throw new Error('openspec list --json returned no changes array')
  }
  for (const [index, change] of parsed.changes.entries()) {
    if (change === null || typeof change !== 'object'
      || typeof change.name !== 'string' || change.name === ''
      || typeof change.status !== 'string' || change.status === '') {
      throw new Error(`openspec list --json returned an invalid change at index ${String(index)}`)
    }
  }
  return parsed.changes
}

/**
 * Run the main-only gate.
 *
 * @param deps - test-only `cli`, `resolveCli`, `cwd`, `stdout` and `stderr`.
 * @returns process exit code: 0 pass, 1 failure.
 */
export function main(deps = {}) {
  const cwd = deps.cwd ?? process.cwd()
  const write = deps.stdout ?? ((text) => process.stdout.write(text))
  const error = deps.stderr ?? ((text) => process.stderr.write(text))

  let cli
  try {
    cli = typeof deps.cli === 'string' && deps.cli !== ''
      ? deps.cli
      : (deps.resolveCli ?? resolveBundledCli)()
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause)
    error(`pre-push gate: cannot resolve the bundled OpenSpec CLI: ${detail}\n`)
    return 1
  }

  for (const args of VALIDATIONS) {
    const result = runCli(cli, args, { cwd })
    if (result.error !== undefined) {
      error(`pre-push gate: cannot execute the OpenSpec CLI: ${result.error.message}\n`)
      return 1
    }
    if (result.status !== 0) {
      error(`pre-push gate: openspec ${args.join(' ')} failed with exit code ${String(result.status ?? 'unknown')}\n`)
      return 1
    }
  }

  const listed = runCli(cli, ['list', '--json'], { cwd, capture: true })
  if (listed.error !== undefined) {
    error(`pre-push gate: cannot execute the OpenSpec CLI: ${listed.error.message}\n`)
    return 1
  }
  if (listed.status !== 0) {
    const detail = (listed.stderr ?? '').trim()
    error(`pre-push gate: cannot read active changes: openspec list --json failed with exit code ${String(listed.status ?? 'unknown')}${detail === '' ? '' : `\n${detail}`}\n`)
    return 1
  }

  let changes
  try {
    changes = parseActiveChanges(listed.stdout ?? '')
  } catch (cause) {
    error(`pre-push gate: ${cause instanceof Error ? cause.message : String(cause)}\n`)
    return 1
  }

  const blocked = changes.filter((change) => change.status !== ALLOWED_STATUS)
  if (blocked.length === 0) {
    write('pre-push gate: ok\n')
    return 0
  }

  for (const change of blocked) {
    error(`pre-push gate: active change '${change.name}' reports '${change.status}'; ${correctionFor(change.status)}.\n`)
  }
  return 1
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = main()
}
