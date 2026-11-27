#!/usr/bin/env node
/**
 * OpenSpec change-metadata gate.
 *
 * `openspec validate` reads change metadata leniently: a YAML parse error is
 * ignored unless the change declares a `skip_specs` marker, so an unloadable
 * `.openspec.yaml` can pass validation while every command that loads the
 * change (status, instructions, apply, archive) refuses it. This gate runs the
 * strict loader through `openspec status --change <name> --json` for every
 * active change, so pull-request CI and the non-main pre-push hook report the
 * problem before a review starts.
 */

import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { parseJson, resolveBundledCli } from '../lib/openspec.js'

/** Raised for a malformed command line. */
export class UsageError extends Error {}

/**
 * The command line help.
 * @returns usage text.
 */
export function usage() {
  return [
    'usage: node scripts/check-change-metadata.mjs',
    '',
    'Load every active change through `openspec status --change <name> --json`',
    'and fail when any metadata file cannot be loaded.',
  ].join('\n')
}

/**
 * List the active change names under a project root.
 *
 * The CLI validation set excludes `archive` and dot-prefixed directories, and
 * `status` refuses a dot-prefixed change name; the gate enumerates the same
 * set so a lookalike directory is not reported as a change.
 *
 * @param root - project root.
 * @returns active change names, sorted.
 * @throws Error when the change root does not exist.
 */
export function listActiveChanges(root) {
  const directory = join(root, 'openspec', 'changes')
  if (!existsSync(directory)) throw new Error(`the OpenSpec change root ${directory} does not exist`)
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== 'archive' && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort()
}

/**
 * Read the error messages from one status payload.
 * @param payload - parsed `status --json` payload.
 * @returns the messages, or an empty list when the payload carries no error.
 */
export function errorMessages(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) return []
  if (!Array.isArray(payload.status)) return []
  const messages = []
  for (const item of payload.status) {
    if (item === null || typeof item !== 'object' || item.severity !== 'error') continue
    const text = [item.message, item.fix]
      .filter((value) => typeof value === 'string' && value !== '')
      .join(' ')
    messages.push(text === '' ? 'OpenSpec reported an error.' : text)
  }
  return messages
}

/**
 * Check one change's metadata through the strict CLI loader.
 * @param cli - absolute path to the bundled CLI entry.
 * @param root - project root.
 * @param change - change name.
 * @returns the error messages; empty when the metadata loads.
 * @throws Error when the CLI cannot run.
 */
export function checkChange(cli, root, change) {
  const args = ['status', '--change', change, '--json']
  const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8' })
  if (result.error !== undefined) {
    throw new Error(`cannot run the bundled OpenSpec CLI: ${result.error.message}`)
  }
  const payload = parseJson(result.stdout ?? '')
  const reported = errorMessages(payload)
  if (result.status !== 0) {
    if (reported.length > 0) return reported
    const detail = (result.stderr || result.stdout || '').trim()
    const exit = result.status === null ? 'a signal' : `exit code ${String(result.status)}`
    return [`openspec ${args.join(' ')} failed with ${exit}${detail === '' ? '' : `: ${detail}`}`]
  }
  if (reported.length > 0) return reported
  if (payload === undefined || payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return [`openspec ${args.join(' ')} returned no readable projection`]
  }
  return []
}

/**
 * Run the gate.
 * @param argv - arguments after the script name.
 * @param write - stdout sink.
 * @param error - stderr sink.
 * @param deps - test-only `cli`, `resolveCli` and `cwd` overrides.
 * @returns process exit code: 0 pass, 1 a change failed, 2 the gate could not run.
 */
export function main(argv = process.argv.slice(2), write = (text) => process.stdout.write(text), error = (text) => process.stderr.write(text), deps = {}) {
  if (argv.includes('--help') || argv.includes('-h')) {
    write(`${usage()}\n`)
    return 0
  }
  if (argv.length > 0) {
    error(`unknown argument '${argv[0]}'\n${usage()}\n`)
    return 2
  }
  const root = deps.cwd ?? process.cwd()
  let cli
  try {
    cli = typeof deps.cli === 'string' && deps.cli !== ''
      ? deps.cli
      : (deps.resolveCli ?? resolveBundledCli)()
  } catch (cause) {
    error(`change metadata gate: cannot resolve the bundled OpenSpec CLI: ${cause instanceof Error ? cause.message : String(cause)}\n`)
    return 2
  }
  if (!existsSync(cli)) {
    error(`change metadata gate: cannot run the bundled OpenSpec CLI: no file at '${cli}'\n`)
    return 2
  }
  let names
  try {
    names = listActiveChanges(root)
  } catch (cause) {
    error(`change metadata gate: ${cause instanceof Error ? cause.message : String(cause)}\n`)
    return 2
  }
  const failures = []
  for (const name of names) {
    let messages
    try {
      messages = checkChange(cli, root, name)
    } catch (cause) {
      error(`change metadata gate: ${cause instanceof Error ? cause.message : String(cause)}\n`)
      return 2
    }
    if (messages.length > 0) failures.push({ name, messages })
  }
  if (failures.length === 0) {
    write(`change metadata gate: ok (${String(names.length)} active ${names.length === 1 ? 'change' : 'changes'})\n`)
    return 0
  }
  for (const failure of failures) {
    for (const message of failure.messages) {
      error(`change metadata gate: active change '${failure.name}' failed to load: ${message}\n`)
    }
  }
  return 1
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = main()
}
