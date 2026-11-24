#!/usr/bin/env node
/**
 * Pre-push range check for a push that includes refs/heads/main.
 *
 * Git supplies the remote and local commit ids for the main ref. The check
 * applies the shared landed-range rule without fetching; a raw offline push is
 * refused because only `push-landed --offline` sets the marker.
 */

import { pathToFileURL } from 'node:url'

import { assertPushRange } from './landed-push-guard.mjs'
import { resolveRepository } from './push-landed.mjs'

/** SHA-1 object id. */
const OBJECT_ID = /^[0-9a-f]{40}$/iu

/** Zero object id, used for a branch deletion. */
const ZERO_OBJECT_ID = /^0{40}$/u

/** Usage error, mapped to exit code 2. */
export class CheckMainPushUsageError extends Error {
  /** @param message - usage diagnostic. */
  constructor(message) {
    super(message)
    this.name = 'CheckMainPushUsageError'
  }
}

/**
 * Render the command usage.
 * @returns usage text.
 */
export function usage() {
  return [
    'usage: node scripts/check-main-push.mjs <local-sha> <remote-sha>',
    '',
    'Applies the landed-range rule to the main ref supplied by the pre-push hook.',
    'A recorded offline range requires DSH_PUSH_LANDED_OFFLINE=1, set by push-landed --offline.',
  ].join('\n')
}

/**
 * Parse the two positional commit ids.
 * @param argv - command-line arguments.
 * @returns `{ local, remote, help }`.
 * @throws {CheckMainPushUsageError} on a missing, extra or malformed argument.
 */
export function parseArgs(argv) {
  if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) {
    return { help: true, local: undefined, remote: undefined }
  }
  if (argv.length !== 2) throw new CheckMainPushUsageError('expected <local-sha> <remote-sha>')
  const [local, remote] = argv
  if (!OBJECT_ID.test(local)) throw new CheckMainPushUsageError(`invalid local commit '${local}'`)
  if (!OBJECT_ID.test(remote)) throw new CheckMainPushUsageError(`invalid remote commit '${remote}'`)
  return { help: false, local, remote }
}

/**
 * Run the check.
 * @param argv - command-line arguments.
 * @param options - current directory, offline marker and output sinks.
 * @returns process exit code.
 */
export function main(argv = process.argv.slice(2), {
  cwd = process.cwd(),
  offline = process.env.DSH_PUSH_LANDED_OFFLINE === '1',
  stdout = (text) => process.stdout.write(text),
  stderr = (text) => process.stderr.write(text),
} = {}) {
  try {
    const parsed = parseArgs(argv)
    if (parsed.help) {
      stdout(`${usage()}\n`)
      return 0
    }
    if (ZERO_OBJECT_ID.test(parsed.local)) return 0
    if (ZERO_OBJECT_ID.test(parsed.remote)) return 0
    const { root } = resolveRepository(cwd)
    const result = assertPushRange({ root, base: parsed.remote, tip: parsed.local, allowOffline: offline })
    stdout(`check-main-push: ${result.checked} landed manifest(s) checked\n`)
    return 0
  } catch (error) {
    stderr(`check-main-push: ${error instanceof Error ? error.message : String(error)}\n`)
    return error instanceof CheckMainPushUsageError ? 2 : 1
  }
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = main()
}
