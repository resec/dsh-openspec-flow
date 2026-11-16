/**
 * Project-level apply locks.
 *
 * A change holds one lock per apply domain. Every change locks its
 * implementation domain, the worktree whose code and commits the apply
 * produces. A store-backed change also locks its store domain, because its
 * apply review binds the store tree. Inside a git domain the lock lives in the
 * worktree's git directory, so it never appears in `git status` and every
 * OpenSpec root in that worktree shares it. A non-git domain keeps the lock in
 * `openspec/.review/`.
 *
 * The lock identity is the review key `<store>#<change>`. A store-domain lock
 * also records the implementation root, so one shared store change cannot be
 * applied from two projects at once.
 *
 * @module dsh-openspec-flow/review/apply-lock
 */

import { spawnSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import {
  ensureDirectory,
  ensureReviewIgnored,
  readJson,
  withReviewLock,
  writeJsonAtomic,
} from './store.js'

/** Lock record file name inside the lock directory. */
export const LOCK_FILE_NAME = 'apply.lock.json'

/** Lock directory name inside a git directory. */
export const LOCK_DIRECTORY_NAME = 'openspec-flow'

/** Every field of a lock record, in documentation order. */
export const LOCK_FIELDS = [
  'schemaVersion',
  'change',
  'store',
  'changeRoot',
  'implementationRoot',
  'startedAt',
]

/** Lock record schema version. */
export const LOCK_SCHEMA_VERSION = 1

/**
 * Run one git command and return its trimmed stdout.
 * @param root - directory inside the worktree.
 * @param args - git arguments.
 * @returns stdout, or undefined when git fails.
 */
function gitOutput(root, args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' })
  if (result.status !== 0) return undefined
  const value = result.stdout.trim()
  return value === '' ? undefined : value
}

/**
 * The nearest directory at or above a path that contains `openspec/`.
 * @param cwd - starting directory.
 * @returns the absolute root, or undefined.
 */
export function nearestProjectRoot(cwd) {
  if (typeof cwd !== 'string' || cwd === '') return undefined
  let current = resolve(cwd)
  for (;;) {
    if (existsSync(join(current, 'openspec'))) return current
    const parent = dirname(current)
    if (parent === current) return undefined
    current = parent
  }
}

/**
 * The root of the git worktree containing a directory.
 * @param cwd - directory inside the worktree.
 * @returns the absolute worktree root, or undefined.
 */
export function gitWorktreeRoot(cwd) {
  return gitOutput(cwd, ['rev-parse', '--show-toplevel'])
}

/**
 * The git directory of the current worktree.
 * @param root - directory inside the worktree.
 * @returns the absolute git directory, or undefined.
 */
export function gitWorktreeDirectory(root) {
  const value = gitOutput(root, ['rev-parse', '--git-dir'])
  if (value === undefined) return undefined
  return isAbsolute(value) ? value : resolve(root, value)
}

/**
 * The domain a change's implementation belongs to.
 * @param cwd - session working directory.
 * @param resolvedRoot - the change's resolved root.
 * @returns the absolute implementation root.
 */
export function implementationRootOf(cwd, resolvedRoot) {
  return gitWorktreeRoot(cwd) ?? nearestProjectRoot(cwd) ?? resolvedRoot
}

/**
 * The lock domains for one change.
 * @param options - cwd, resolved root, store, change and implementation root.
 * @returns array of `{ kind, root }` in acquisition order.
 */
export function applyLockDomains(options) {
  const implementationRoot = options.implementationRoot
  const domains = [{ kind: 'implementation', root: implementationRoot }]
  const store = typeof options.store === 'string' && options.store.trim() !== ''
    ? options.store.trim()
    : undefined
  if (store !== undefined && resolve(options.resolvedRoot) !== resolve(implementationRoot)) {
    domains.push({ kind: 'store', root: options.resolvedRoot })
  }
  const seen = new Set()
  return domains.filter((domain) => {
    const key = resolve(domain.root)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Resolve the lock directory for one domain root.
 * @param root - domain root.
 * @param create - whether missing directories and the ignore line may be written.
 * @returns `{ directory, file, git }`.
 */
export function applyLockLocation(root, create = true) {
  const gitDirectory = gitWorktreeDirectory(root)
  if (gitDirectory !== undefined) {
    const directory = join(gitDirectory, LOCK_DIRECTORY_NAME)
    if (create) ensureDirectory(directory)
    return { directory, file: join(directory, LOCK_FILE_NAME), git: true }
  }
  if (create) {
    ensureReviewIgnored(root)
    ensureDirectory(join(root, 'openspec', '.review'))
  }
  const directory = join(root, 'openspec', '.review')
  return { directory, file: join(directory, LOCK_FILE_NAME), git: false }
}

/**
 * Read one lock file.
 * @param file - absolute lock path.
 * @returns the record, or undefined.
 */
export function readApplyLock(file) {
  return readJson(file)
}

/**
 * The lock path for one domain root without creating anything.
 * @param root - domain root.
 * @returns the absolute lock file path.
 */
export function applyLockPath(root) {
  return applyLockLocation(root, false).file
}

/**
 * Detach the expected identity for a change.
 * @param options - change, store, change root and implementation root.
 * @returns the identity.
 */
export function applyLockIdentity(options) {
  const store = typeof options.store === 'string' && options.store.trim() !== ''
    ? options.store.trim()
    : undefined
  const implementationRoot = typeof options.implementationRoot === 'string'
    && options.implementationRoot !== ''
    ? options.implementationRoot
    : implementationRootOf(options.cwd, options.resolvedRoot)
  return {
    change: options.change,
    store,
    changeRoot: options.changeRoot,
    implementationRoot,
  }
}

/**
 * Whether a record names the expected change.
 * @param record - lock record.
 * @param identity - expected identity.
 * @param kind - `implementation` or `store`.
 * @returns true when the record is this change's lock.
 */
export function applyLockMatches(record, identity, kind) {
  if (record === null || typeof record !== 'object') return false
  if (record.change !== identity.change) return false
  const store = typeof record.store === 'string' && record.store !== '' ? record.store : undefined
  if (store !== identity.store) return false
  if (kind === 'store' && record.implementationRoot !== identity.implementationRoot) return false
  return true
}

/**
 * Whether a recorded lock can be replaced.
 * @param record - lock record.
 * @returns true when the record is absent, damaged, or its roots are gone.
 */
export function applyLockIsStale(record) {
  if (record === null || typeof record !== 'object') return true
  if (typeof record.changeRoot !== 'string' || record.changeRoot === '') return true
  if (!existsSync(record.changeRoot)) return true
  if (typeof record.implementationRoot !== 'string' || record.implementationRoot === '') return true
  if (!existsSync(record.implementationRoot)) return true
  return false
}

/**
 * Build the refusal for a lock held by another identity.
 * @param domain - domain descriptor.
 * @param location - lock location.
 * @param record - holder record.
 * @returns the error.
 */
function lockRefusal(domain, location, record) {
  const store = typeof record.store === 'string' && record.store !== '' ? record.store : 'local'
  const holder = `${store}#${String(record.change)}`
  return new Error(
    `the ${domain.kind} apply lock at '${location.file}' is held by ${holder} `
    + `(implementation root ${String(record.implementationRoot)}); `
    + 'ask the user to remove the lock file if that change is paused',
  )
}

/**
 * Acquire one domain's lock.
 * @param domain - `{ kind, root }`.
 * @param identity - expected identity.
 * @returns the acquired lock descriptor.
 */
function acquireOneLock(domain, identity) {
  const location = applyLockLocation(domain.root, true)
  return withReviewLock(location.directory, `acquire-${domain.kind}-apply`, () => {
    const existing = readApplyLock(location.file)
    if (existing !== undefined && !applyLockIsStale(existing)) {
      if (!applyLockMatches(existing, identity, domain.kind)) {
        throw lockRefusal(domain, location, existing)
      }
      return { ...location, kind: domain.kind, root: domain.root, record: existing, created: false }
    }
    const record = {
      schemaVersion: LOCK_SCHEMA_VERSION,
      change: identity.change,
      store: identity.store ?? null,
      changeRoot: identity.changeRoot,
      implementationRoot: identity.implementationRoot,
      startedAt: new Date().toISOString(),
    }
    writeJsonAtomic(location.file, record)
    return { ...location, kind: domain.kind, root: domain.root, record, created: true }
  })
}

/**
 * Acquire every lock the change requires.
 *
 * The implementation domain is locked first, then the store domain. A failure
 * releases every lock this call created, so a partially acquired set never
 * blocks a later change.
 *
 * @param options - cwd, resolved root, store, change, change root and
 *   implementation root.
 * @returns `{ locks, created }`; `created` holds only locks this call wrote.
 * @throws when another identity holds a lock.
 */
export function acquireApplyLocks(options) {
  const identity = applyLockIdentity(options)
  const domains = applyLockDomains({ ...options, implementationRoot: identity.implementationRoot })
  const locks = []
  try {
    for (const domain of domains) locks.push(acquireOneLock(domain, identity))
    return { locks, created: locks.filter((lock) => lock.created) }
  } catch (error) {
    releaseApplyLocks(locks)
    throw error
  }
}

/**
 * Remove lock files.
 * @param locks - lock descriptors, or anything with a `file` field.
 * @returns nothing.
 */
export function releaseApplyLocks(locks) {
  for (const lock of locks ?? []) {
    if (typeof lock?.file !== 'string') continue
    try {
      rmSync(lock.file, { force: true })
    } catch {
      // A failed release must not hide the caller's result.
    }
  }
}

/**
 * Read every lock a change would acquire without writing anything.
 * @param options - cwd, resolved root, store, change, change root and
 *   implementation root.
 * @returns `{ locks }` with `record`, `stale` and `mine` per domain.
 */
export function inspectApplyLocks(options) {
  const identity = applyLockIdentity(options)
  const domains = applyLockDomains({ ...options, implementationRoot: identity.implementationRoot })
  return {
    locks: domains.map((domain) => {
      const location = applyLockLocation(domain.root, false)
      const record = existsSync(location.file) ? readApplyLock(location.file) : undefined
      return {
        ...location,
        kind: domain.kind,
        root: domain.root,
        record,
        stale: record === undefined ? false : applyLockIsStale(record),
        mine: record !== undefined && applyLockMatches(record, identity, domain.kind),
      }
    }),
  }
}

/**
 * The blocker among inspected locks.
 * @param inspected - result of `inspectApplyLocks`.
 * @returns the first lock that is neither stale nor owned by the change, or undefined.
 */
export function applyLockBlocker(inspected) {
  return inspected.locks.find((lock) => lock.record !== undefined && !lock.stale && !lock.mine)
}

/**
 * Build the model-facing refusal for a held lock.
 * @param lock - inspected lock descriptor.
 * @returns the error.
 */
export function applyLockBlockedError(lock) {
  return lockRefusal(
    { kind: lock.kind },
    { file: lock.file },
    lock.record,
  )
}

