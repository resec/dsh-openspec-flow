#!/usr/bin/env node
/**
 * Record a pre-publish offline land so `push-landed --offline` can verify it.
 *
 * An offline completion writes no local owner entry when `pr-publish` reports
 * `offline-land`. This command records the landed manifest by its resolved land
 * commit; a published but unmerged pull request may instead use the existing
 * `landed-offline` phase. The command never pushes.
 */

import { pathToFileURL } from 'node:url'
import { join } from 'node:path'

import { findLocalEntry } from './pr-review-watch.mjs'
import {
  offlineLandsPath,
  readOfflineLands,
  writeOfflineLands,
} from './landed-push-guard.mjs'
import {
  MANIFEST_DIRECTORY,
  listManifests,
  resolveRepository,
  selectManifest,
  validateLocalState,
} from './push-landed.mjs'

/** A usage error, mapped to exit code 2. */
export class OfflineLandUsageError extends Error {
  /** @param message - usage diagnostic. */
  constructor(message) {
    super(message)
    this.name = 'OfflineLandUsageError'
  }
}

/**
 * Parse the supported flags.
 * @param argv - command-line arguments.
 * @returns parsed options.
 * @throws {OfflineLandUsageError} on an unknown, duplicate or incomplete flag.
 */
export function parseArgs(argv) {
  const options = { command: undefined, change: undefined, land: undefined, session: undefined, apply: false, help: false }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--apply') {
      if (options.apply) throw new OfflineLandUsageError('--apply was passed more than once')
      options.apply = true
      continue
    }
    if (argument === '--help' || argument === '-h') {
      options.help = true
      continue
    }
    const match = /^(--change|--land|--session)(?:=(.*))?$/u.exec(argument)
    if (match === null) {
      if (argument.startsWith('--')) throw new OfflineLandUsageError(`unknown argument '${argument}'`)
      if (options.command !== undefined) throw new OfflineLandUsageError('only one command is allowed')
      options.command = argument
      continue
    }
    const name = match[1].slice(2)
    const value = match[2] !== undefined ? match[2] : argv[index + 1]
    if (value === undefined || value === '' || (match[2] === undefined && value.startsWith('--'))) {
      throw new OfflineLandUsageError(`${match[1]} needs a value`)
    }
    if (options[name] !== undefined) throw new OfflineLandUsageError(`${match[1]} was passed more than once`)
    options[name] = value
    if (match[2] === undefined) index += 1
  }
  return options
}

/**
 * Render the command usage.
 * @returns usage text.
 */
export function usage() {
  return [
    'usage: node scripts/offline-land.mjs record --change <name> --land <sha> [--session <id>] [--apply]',
    '',
    'Records a landed worktree change as a deferred offline land. The default is a dry run.',
    '--apply writes .cache/pr-review/offline-lands.json; push-landed --offline reads it.',
  ].join('\n')
}

/**
 * Whether two offline records describe the same manifest.
 * @param left - existing record.
 * @param right - candidate record.
 * @returns true when the land facts agree.
 */
function sameRecord(left, right) {
  return left !== null && typeof left === 'object'
    && left.change === right.change
    && left.archiveCommit === right.archiveCommit
    && left.featureTree === right.featureTree
}

/**
 * Record one offline land.
 * @param options - command options.
 * @param cwd - current directory.
 * @returns the recorded or dry-run facts.
 * @throws {OfflineLandUsageError} when the command or required flags are missing.
 */
export function recordOfflineLand({ change, land, session, apply = false } = {}, cwd = process.cwd()) {
  if (typeof change !== 'string' || change.trim() === '') {
    throw new OfflineLandUsageError('record needs --change <name>')
  }
  if (typeof land !== 'string' || land.trim() === '') {
    throw new OfflineLandUsageError('record needs --land <sha>')
  }
  if (session !== undefined && (typeof session !== 'string' || session.trim() === '')) {
    throw new OfflineLandUsageError('--session needs a non-empty value')
  }

  const { root, commonDir } = resolveRepository(cwd)
  const entries = listManifests(join(commonDir, MANIFEST_DIRECTORY))
  const entry = selectManifest(entries, { change, land }, cwd)
  const manifest = entry.manifest
  if (manifest.change !== change) {
    throw new Error(`land commit ${manifest.landCommit} belongs to change ${manifest.change}, not ${change}`)
  }
  validateLocalState(root, manifest)

  const local = findLocalEntry(root, { change: manifest.change })
  if (local !== undefined) {
    if (local.phase === 'pushed') {
      throw new Error(`PR #${local.number} for ${manifest.change} is already pushed; there is no deferred land to record`)
    }
    if (local.phase !== 'landed-offline') {
      throw new Error(`PR #${local.number} for ${manifest.change} is ${local.phase}; finish the online flow or record landed-offline first`)
    }
    if (session !== undefined && local.ownerSession !== session) {
      throw new Error(`PR #${local.number} belongs to session ${local.ownerSession}, not ${session}`)
    }
  }

  const record = {
    change: manifest.change,
    landCommit: manifest.landCommit,
    archiveCommit: manifest.archiveCommit,
    featureTree: manifest.featureTree,
    session: session ?? local?.ownerSession ?? null,
    recordedAt: new Date().toISOString(),
  }
  const state = readOfflineLands(root)
  const existing = state.lands[manifest.landCommit]
  if (existing !== undefined && !sameRecord(existing, record)) {
    throw new Error(`a different offline-land record already exists for land commit ${manifest.landCommit}`)
  }
  const next = {
    schemaVersion: 1,
    lands: { ...state.lands, [manifest.landCommit]: record },
  }
  if (!apply) {
    return { dryRun: true, record, file: offlineLandsPath(root) }
  }
  writeOfflineLands(root, next)
  return { recorded: true, record, file: offlineLandsPath(root) }
}

/**
 * Run the command.
 * @param argv - command-line arguments.
 * @param cwd - current directory.
 * @returns process exit code.
 */
export function main(argv = process.argv.slice(2), cwd = process.cwd()) {
  try {
    const options = parseArgs(argv)
    if (options.help) {
      process.stdout.write(`${usage()}\n`)
      return 0
    }
    if (options.command !== 'record') {
      throw new OfflineLandUsageError(options.command === undefined ? 'a command is required' : `unknown command '${options.command}'`)
    }
    const result = recordOfflineLand({
      change: options.change,
      land: options.land,
      session: options.session,
      apply: options.apply,
    }, cwd)
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    return 0
  } catch (error) {
    process.stderr.write(`offline-land: ${error instanceof Error ? error.message : String(error)}\n`)
    return error instanceof OfflineLandUsageError ? 2 : 1
  }
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = main()
}
