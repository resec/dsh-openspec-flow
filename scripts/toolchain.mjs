/**
 * Toolchain paths, the pnpm pin and the record helpers shared by the
 * repository scripts.
 *
 * This module is not shipped with the plugin. The plugin imports the packaged
 * `lib/toolchain-record.js` directly; bootstrap, the lab and the hook import
 * this module, which re-exports it and adds the bucket and Playwright helpers.
 *
 * @module dsh-openspec-flow/toolchain
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  INPUT_PATHS,
  PNPM_VERSION,
  RECORD_RELATIVE,
  RECORD_SCHEMA,
  RecordError,
  buildRecord,
  hashInputs,
  missingRecordPaths,
  preparationCorrection,
  readRecord,
  realOrResolved,
  recordPath,
  requireRecord,
  writeRecord,
} from '../lib/toolchain-record.js'

export {
  INPUT_PATHS,
  PNPM_VERSION,
  RECORD_RELATIVE,
  RECORD_SCHEMA,
  RecordError,
  buildRecord,
  hashInputs,
  missingRecordPaths,
  preparationCorrection,
  readRecord,
  realOrResolved,
  recordPath,
  requireRecord,
  writeRecord,
}

/** The shared root relative to the main worktree. */
export const SHARED_RELATIVE = join('.cache', 'openspec-flow', 'shared')

/**
 * The shared root for one main worktree.
 * @param mainRoot - main worktree root.
 * @returns the absolute shared root.
 */
export function sharedRootFor(mainRoot) {
  return join(mainRoot, SHARED_RELATIVE)
}

/**
 * The Node runtime bucket for one exact version.
 * @param sharedRoot - shared root.
 * @param version - exact Node version, with or without a `v`.
 * @returns the bucket path.
 */
export function nodeBucket(sharedRoot, version) {
  return join(sharedRoot, 'toolchain', 'node', String(version).replace(/^v/, ''))
}

/**
 * The pnpm bucket for the pinned version.
 * @param sharedRoot - shared root.
 * @param version - pnpm version; defaults to the pin.
 * @returns the bucket path.
 */
export function pnpmBucket(sharedRoot, version = PNPM_VERSION) {
  return join(sharedRoot, 'toolchain', 'pnpm', version)
}

/**
 * The Chromium bucket for one Playwright version.
 * @param sharedRoot - shared root.
 * @param playwrightVersion - resolved Playwright version.
 * @returns the bucket path.
 */
export function chromiumBucket(sharedRoot, playwrightVersion) {
  return join(sharedRoot, 'browsers', `playwright-${playwrightVersion}`)
}

/**
 * The Playwright version a worktree resolves.
 *
 * The installed package wins; otherwise the lockfile names the version, so a
 * worktree can resolve its browser bucket before `npm ci`.
 * @param root - worktree root.
 * @returns the exact Playwright version.
 * @throws when neither source names a version.
 */
export function resolvePlaywrightVersion(root) {
  const installed = join(root, 'node_modules', 'playwright-core', 'package.json')
  if (existsSync(installed)) {
    const version = JSON.parse(readFileSync(installed, 'utf8')).version
    if (typeof version === 'string' && version !== '') return version
  }
  const lockPath = join(root, 'package-lock.json')
  if (existsSync(lockPath)) {
    const lock = JSON.parse(readFileSync(lockPath, 'utf8'))
    for (const key of ['node_modules/playwright-core', 'node_modules/playwright']) {
      const version = lock.packages?.[key]?.version
      if (typeof version === 'string' && version !== '') return version
    }
  }
  throw new Error(
    `cannot resolve the Playwright version under ${root}; run npm ci, or set PLAYWRIGHT_BROWSERS_PATH explicitly`,
  )
}

/**
 * The browser revisions the local Playwright package expects.
 * @param root - worktree root.
 * @returns `{ chromium, headlessShell, ffmpeg }` revision strings.
 * @throws when the local package has no browsers.json.
 */
export function readChromiumRevisions(root) {
  const file = join(root, 'node_modules', 'playwright-core', 'browsers.json')
  if (!existsSync(file)) {
    throw new Error(`node_modules/playwright-core/browsers.json is missing under ${root}; run npm ci first`)
  }
  const parsed = JSON.parse(readFileSync(file, 'utf8'))
  const byName = new Map((parsed.browsers ?? []).map((entry) => [entry.name, entry]))
  const revisions = {}
  for (const [key, name] of [['chromium', 'chromium'], ['headlessShell', 'chromium-headless-shell'], ['ffmpeg', 'ffmpeg']]) {
    const entry = byName.get(name)
    if (entry === undefined || typeof entry.revision !== 'string') {
      throw new Error(`browsers.json names no ${name} revision under ${root}`)
    }
    revisions[key] = entry.revision
  }
  return revisions
}

/**
 * Resolve the current worktree's recorded pnpm, or undefined when absent.
 * @param root - worktree root.
 * @param options - platform and pnpm version overrides for tests.
 * @returns `{ record, node, pnpm }`, or undefined when no record exists.
 * @throws {RecordError} when the record is stale, unreadable or has missing paths.
 */
export function resolveRecordedPnpm(root, options = {}) {
  const result = readRecord(root, options)
  if (result.state === 'absent') return undefined
  if (result.state !== 'current') {
    throw new RecordError(
      `the toolchain record at ${recordPath(root)} is ${result.state}: ${result.reasons.join('; ')}`,
      result.state,
      result.correction,
    )
  }
  const missing = missingRecordPaths(result.record)
  if (missing.length > 0) {
    throw new RecordError(
      `the toolchain record at ${recordPath(root)} names missing paths: ${missing.join(', ')}`,
      'missing-path',
    )
  }
  return { record: result.record, node: result.record.node, pnpm: result.record.pnpm }
}


/**
 * Print the current worktree's recorded Node path, or nothing when no record
 * exists. A stale or unreadable record exits nonzero with its correction.
 */
function main() {
  const [command] = process.argv.slice(2)
  if (command !== 'node-path') {
    process.stderr.write('usage: node scripts/toolchain.mjs node-path\n')
    process.exitCode = 2
    return
  }
  const result = readRecord(process.cwd())
  if (result.state === 'absent') return
  if (result.state !== 'current') {
    process.stderr.write(`toolchain: the record is ${result.state}: ${result.reasons.join('; ')}; ${result.correction}\n`)
    process.exitCode = 1
    return
  }
  process.stdout.write(`${result.record.node.path}\n`)
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main()
}
