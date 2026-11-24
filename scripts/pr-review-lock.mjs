#!/usr/bin/env node
/**
 * Cross-session landing lock for the local PR completion path.
 *
 * The lock lives under the main worktree so an owner session running in the
 * plugin apply worktree and the scheduled watch resolve the same file.
 */

import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'

import {
  LANDING_LOCK_TTL_MINUTES,
  UsageError,
  mainWorktree,
  readLandingLock,
  resolvePaths,
  writeJsonAtomic,
} from './pr-review-watch.mjs'

/** Owner file name. */
export const OWNER_FILE = 'owner.json'

/** Resolve the lock directory and owner file. */
export function lockPaths(root) {
  const paths = resolvePaths(root)
  return { directory: paths.landingLock, owner: join(paths.landingLock, OWNER_FILE) }
}

/**
 * Read the lock owner.
 * @param root - main worktree.
 * @returns owner object, or undefined when free.
 */
export function readLockOwner(root) {
  const { directory, owner } = lockPaths(root)
  if (!existsSync(owner)) {
    if (existsSync(directory)) throw new Error(`the landing lock at ${directory} is corrupt: owner file missing`)
    return undefined
  }
  let value
  try {
    value = JSON.parse(readFileSync(owner, 'utf8'))
  } catch (error) {
    throw new Error(`the landing lock at ${owner} is corrupt: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || typeof value.ownerSession !== 'string' || value.ownerSession.trim() === ''
    || typeof value.token !== 'string' || value.token.trim() === ''
    || !Number.isInteger(value.pr) || value.pr < 1
    || typeof value.at !== 'string' || Number.isNaN(Date.parse(value.at))) {
    throw new Error(`the landing lock at ${owner} is corrupt`)
  }
  return value
}

/**
 * Acquire the lock for one owner session.
 *
 * The same owner session re-enters its existing lock even without the earlier
 * token, so a crashed scheduled run resumes instead of waiting for the lock to
 * go stale. Another session is always refused.
 * @param options - root, session, token, pr and optional now.
 * @returns the owner record.
 */
export function acquireLock({ root = mainWorktree(), session, token, pr, now = new Date().toISOString() } = {}) {
  if (typeof session !== 'string' || session.trim() === '') throw new UsageError('acquire needs --session')
  if (!Number.isInteger(Number(pr)) || Number(pr) < 1) throw new UsageError('acquire needs a positive --pr')
  const ownerToken = typeof token === 'string' && token.trim() !== '' ? token : randomUUID()
  const { directory, owner } = lockPaths(root)
  mkdirSync(dirname(directory), { recursive: true })
  try {
    mkdirSync(directory)
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error
    const existing = readLockOwner(root)
    if (existing === undefined) throw new Error(`the landing lock at ${directory} is corrupt`)
    if (existing.ownerSession === session) return existing
    throw new Error(`the landing lock is held by session ${existing.ownerSession} for PR #${String(existing.pr)}`)
  }
  const record = {
    schemaVersion: 1,
    ownerSession: session,
    token: ownerToken,
    pr: Number(pr),
    at: now,
    pid: process.pid,
  }
  writeJsonAtomic(owner, record)
  return record
}

/**
 * Release the lock for the recorded owner.
 * @param options - root, session and token.
 * @returns release result.
 */
export function releaseLock({ root = mainWorktree(), session, token } = {}) {
  const existing = readLockOwner(root)
  if (existing === undefined) return { released: false, reason: 'free' }
  if (existing.ownerSession !== session || existing.token !== token) {
    throw new Error(`the landing lock is held by session ${existing.ownerSession}; the supplied session or token does not match`)
  }
  const { directory } = lockPaths(root)
  rmSync(directory, { recursive: true, force: true })
  return { released: true, ownerSession: existing.ownerSession, pr: existing.pr }
}

/**
 * Release the lock explicitly as an operator.
 * @param options - root and reason.
 * @returns release result.
 */
export function forceRelease({ root = mainWorktree(), reason } = {}) {
  if (typeof reason !== 'string' || reason.trim() === '') throw new UsageError('force-release needs --reason')
  const existing = readLockOwner(root)
  if (existing === undefined) return { released: false, reason: 'free' }
  const { directory } = lockPaths(root)
  rmSync(directory, { recursive: true, force: true })
  return { released: true, ownerSession: existing.ownerSession, pr: existing.pr, reason }
}

/**
 * Read the lock status.
 * @param options - root and optional now.
 * @returns status object.
 */
export function lockStatus({ root = mainWorktree(), now = Date.now() } = {}) {
  const status = readLandingLock(root, now)
  return { ...status, ttlMinutes: LANDING_LOCK_TTL_MINUTES }
}

/**
 * Accept the lock when free or owned by the caller.
 * @param options - root, session and token.
 * @returns the owner record or undefined.
 */
export function assertLockOwnerOrFree({ root = mainWorktree(), session, token } = {}) {
  const existing = readLockOwner(root)
  if (existing === undefined) return undefined
  if (existing.ownerSession === session && existing.token === token) return existing
  throw new Error(`the landing lock is held by session ${existing.ownerSession}; acquire it or release it before continuing`)
}

/**
 * Refuse when the lock is held by a session other than the caller.
 * @param options - root and session.
 * @returns the owner record or undefined.
 */
export function assertLockNotHeldByOther({ root = mainWorktree(), session } = {}) {
  const existing = readLockOwner(root)
  if (existing === undefined) return undefined
  if (typeof session === 'string' && existing.ownerSession === session) return existing
  throw new Error(`the landing lock is held by session ${existing.ownerSession}; wait or use the owner session`)
}

/** Render usage. */
export function usage() {
  return [
    'usage: node scripts/pr-review-lock.mjs <command>',
    '',
    'commands:',
    '  status [--json]',
    '  acquire --session <id> --pr <n> [--token <token>]',
    '  release --session <id> --token <token>',
    '',
    '--owner-session is accepted as an alias for --session.',
    '  force-release --reason <text>',
  ].join('\n')
}

/** Parse one command line. */
export function parseArgs(argv) {
  const args = [...argv]
  const command = args.shift()
  if (command === undefined || command === '--help' || command === '-h') return { command: 'help' }
  if (!['status', 'acquire', 'release', 'force-release'].includes(command)) {
    throw new UsageError(`unknown command '${command}'`)
  }
  const options = { command, json: false, session: undefined, token: undefined, pr: undefined, reason: undefined }
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index]
    if (value === '--json') options.json = true
    else if (['--session', '--owner-session', '--token', '--pr', '--reason'].includes(value)) {
      const next = args[index + 1]
      if (next === undefined || next === '' || next.startsWith('--')) throw new UsageError(`${value} needs a value`)
      if (value === '--session' || value === '--owner-session') options.session = next
      else if (value === '--token') options.token = next
      else if (value === '--reason') options.reason = next
      else options.pr = Number(next)
      index += 1
    } else if (value.startsWith('--')) throw new UsageError(`unknown argument '${value}'`)
    else throw new UsageError(`unexpected argument '${value}'`)
  }
  if (command === 'acquire') {
    if (typeof options.session !== 'string' || options.session.trim() === '') throw new UsageError('acquire needs --session')
    if (!Number.isInteger(options.pr) || options.pr < 1) throw new UsageError('acquire needs a positive --pr')
  }
  if (command === 'release' && (typeof options.session !== 'string' || options.token === undefined)) {
    throw new UsageError('release needs --session and --token')
  }
  if (command === 'force-release' && (typeof options.reason !== 'string' || options.reason.trim() === '')) {
    throw new UsageError('force-release needs --reason')
  }
  return options
}

/** CLI entry. */
export function main(argv = process.argv.slice(2), write = (text) => process.stdout.write(text)) {
  try {
    const options = parseArgs(argv)
    if (options.command === 'help') {
      write(`${usage()}\n`)
      return 0
    }
    const root = mainWorktree()
    let result
    if (options.command === 'status') result = lockStatus({ root })
    else if (options.command === 'acquire') {
      result = acquireLock({ root, session: options.session, token: options.token, pr: options.pr })
    } else if (options.command === 'release') {
      result = releaseLock({ root, session: options.session, token: options.token })
    } else {
      result = forceRelease({ root, reason: options.reason })
    }
    write(`${JSON.stringify(result, null, 2)}\n`)
    return 0
  } catch (error) {
    write(`${error instanceof Error ? error.message : String(error)}\n`)
    return error instanceof UsageError ? 2 : 1
  }
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = main()
}
