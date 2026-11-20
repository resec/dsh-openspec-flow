/**
 * Apply worktree lifecycle and change locks.
 *
 * A lock is a directory created by renaming a complete owner directory into
 * place, so the lock path never exists without an owner. A waiter never
 * removes a dead owner's lock; recovery is an explicit compare-and-delete.
 *
 * @module dsh-openspec-flow/worktree/lock
 */

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { gitCommonDir, reviewKey } from '../review/store.js'

/** The lifecycle lock directory name. */
export const LIFECYCLE_LOCK_NAME = 'lifecycle.lock.d'
/** The directory holding one lock per change. */
export const CHANGE_LOCK_DIRECTORY = 'changes'
/** The default wait for one acquisition. */
export const LOCK_TIMEOUT_MS = 10 * 60_000
/** The default poll interval. */
export const LOCK_POLL_MS = 200

const heldChangeDomains = new Set()
let tokenCounter = 0

/** The scopes a lock supports. */
export const LOCK_SCOPES = ['lifecycle', 'change']

/**
 * Whether a process exists.
 * @param pid - process id.
 * @returns true when the process exists.
 */
export function processAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (error?.code === 'ESRCH') return false
    if (error?.code === 'EPERM') return true
    throw error
  }
}

/**
 * The absolute lock path for one scope.
 * @param commonDir - git common directory.
 * @param scope - lifecycle or change.
 * @param options - store and change.
 * @returns the absolute lock directory.
 */
export function lockPath(commonDir, scope, options = {}) {
  if (scope === 'lifecycle') return join(commonDir, 'openspec-flow', LIFECYCLE_LOCK_NAME)
  const key = reviewKey(options.store, options.change)
  return join(commonDir, 'openspec-flow', CHANGE_LOCK_DIRECTORY, `${key}.lock.d`)
}

/**
 * Inspect one lock path.
 * @param path - lock directory.
 * @returns `{state, owner?, reason?}`.
 */
export function inspectLock(path) {
  let text
  try {
    text = readFileSync(join(path, 'owner'), 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT' && !existsSync(path)) return { state: 'missing' }
    if (error?.code === 'ENOENT') return { state: 'corrupt', reason: 'the owner file is missing' }
    return { state: 'corrupt', reason: `the owner file is unreadable (${error?.code ?? 'unknown'})` }
  }
  let owner
  try {
    owner = JSON.parse(text)
  } catch {
    return { state: 'corrupt', owner: undefined, reason: 'the owner file is not valid JSON' }
  }
  if (!Number.isInteger(owner?.pid) || typeof owner?.token !== 'string' || owner.token === '') {
    return { state: 'corrupt', owner, reason: 'the owner file has no integer pid or token' }
  }
  return { state: processAlive(owner.pid) ? 'alive' : 'dead', owner }
}

/** A token unique to this process and acquisition. */
function newToken(now) {
  tokenCounter += 1
  return `${String(process.pid)}-${now().toString(36)}-${String(tokenCounter)}`
}

/** Sleep. */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** The owner record for one lock. */
function ownerRecord(what, now) {
  return {
    schema: 1,
    token: newToken(now),
    pid: process.pid,
    at: new Date(now()).toISOString(),
    what,
  }
}

/** Create a lock atomically by renaming a complete owner directory. */
function createLock(path, what, now) {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.tmp-${String(process.pid)}-${String(Date.now())}`
  mkdirSync(temporary)
  const owner = ownerRecord(what, now)
  try {
    writeFileSync(join(temporary, 'owner'), `${JSON.stringify(owner)}\n`, { flag: 'wx' })
    renameSync(temporary, path)
    return { path, owner }
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true })
    if (error?.code === 'EEXIST' || error?.code === 'ENOTEMPTY') return undefined
    throw error
  }
}

/** The message for a dead owner. */
function deadOwnerMessage(path, owner, scope) {
  return `the ${scope} lock at ${path} is held by dead process ${String(owner.pid)} (token ${owner.token}); `
    + `recover it with openspec_apply_worktree action=recover scope=${scope} expectedOwner=${owner.token}`
}

/**
 * Acquire one lock.
 * @param commonDir - git common directory.
 * @param scope - lifecycle or change.
 * @param options - store, change, what, timeout.
 * @returns a release handle.
 */
export async function acquireLock(commonDir, scope, options = {}) {
  if (!LOCK_SCOPES.includes(scope)) throw new Error(`unknown lock scope '${String(scope)}'; use lifecycle or change`)
  if (scope === 'change' && (typeof options.change !== 'string' || options.change.trim() === '')) {
    throw new Error('a change lock requires a non-empty change')
  }
  const path = lockPath(commonDir, scope, options)
  if (scope === 'lifecycle' && heldChangeDomains.has(commonDir)) {
    throw new Error('the lifecycle lock must be acquired before a change lock; release the change lock first')
  }
  const timeoutMs = Number.isInteger(options.timeoutMs) ? options.timeoutMs : LOCK_TIMEOUT_MS
  const pollMs = Number.isInteger(options.pollMs) ? options.pollMs : LOCK_POLL_MS
  const now = options.now ?? Date.now
  const deadline = now() + timeoutMs
  if (typeof options.reuseToken === 'string' && options.reuseToken !== '') {
    const existing = inspectLock(path)
    if (existing.state === 'alive' && existing.owner.token === options.reuseToken && existing.owner.pid === process.pid) {
      if (scope === 'change') heldChangeDomains.add(commonDir)
      return { path, owner: existing.owner, scope, commonDir, reused: true }
    }
  }
  for (;;) {
    const created = createLock(path, options.what ?? scope, now)
    if (created !== undefined) {
      if (scope === 'change') heldChangeDomains.add(commonDir)
      return { path, owner: created.owner, scope, commonDir }
    }
    const inspection = inspectLock(path)
    if (inspection.state === 'dead' && options.reclaimDead === true) {
      rmSync(path, { recursive: true, force: true })
      continue
    }
    if (inspection.state === 'dead') throw new Error(deadOwnerMessage(path, inspection.owner, scope))
    if (inspection.state === 'corrupt') {
      throw new Error(`the ${scope} lock at ${path} has no usable owner: ${String(inspection.reason)}; inspect it by hand`)
    }
    if (now() >= deadline) {
      const ownerText = inspection.owner === undefined
        ? ''
        : ` (pid ${String(inspection.owner.pid)}, token ${String(inspection.owner.token)})`
      const recoverText = inspection.owner === undefined
        ? ''
        : `, or recover a dead owner with openspec_apply_worktree action=recover scope=${scope} expectedOwner=${String(inspection.owner.token)}`
      throw new Error(`another operation holds the ${scope} lock at ${path}${ownerText}; wait for it${recoverText}`)
    }
    await sleep(pollMs)
  }
}

/**
 * Release a lock only when the caller owns it.
 * @param handle - acquisition handle.
 * @returns `{released, owner?}`.
 */
export function releaseLock(handle) {
  const inspection = inspectLock(handle.path)
  if (inspection.state === 'missing') {
    if (handle.scope === 'change') heldChangeDomains.delete(handle.commonDir)
    return { released: true }
  }
  if (inspection.owner?.token !== handle.owner.token) {
    if (handle.scope === 'change') heldChangeDomains.delete(handle.commonDir)
    return { released: false, owner: inspection.owner }
  }
  rmSync(handle.path, { recursive: true, force: true })
  if (handle.scope === 'change') heldChangeDomains.delete(handle.commonDir)
  return { released: true }
}

/**
 * Acquire the lifecycle lock and then the change lock in the fixed order.
 * @param commonDir - git common directory.
 * @param options - store, change, what, timeout.
 * @returns `{lifecycle, change}` handles.
 */
export async function acquireOrdered(commonDir, options = {}) {
  const lifecycle = await acquireLock(commonDir, 'lifecycle', options)
  try {
    const change = await acquireLock(commonDir, 'change', options)
    return { lifecycle, change }
  } catch (error) {
    releaseLock(lifecycle)
    throw error
  }
}

/**
 * Recover a lock whose recorded owner is dead.
 * @param commonDir - git common directory.
 * @param scope - lifecycle or change.
 * @param options - store, change, expectedOwner.
 * @returns `{recovered: true, scope}`.
 */
export function recoverLock(commonDir, scope, options = {}) {
  if (!LOCK_SCOPES.includes(scope)) throw new Error(`unknown lock scope '${String(scope)}'; use lifecycle or change`)
  if (scope === 'change' && (typeof options.change !== 'string' || options.change.trim() === '')) {
    throw new Error('a change lock recovery requires a non-empty change')
  }
  if (typeof options.expectedOwner !== 'string' || options.expectedOwner.trim() === '') {
    throw new Error('recovery requires the expectedOwner token')
  }
  const path = lockPath(commonDir, scope, options)
  const recovery = `${path}.recover.d`
  mkdirSync(dirname(recovery), { recursive: true })
  try {
    mkdirSync(recovery)
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error
    throw new Error(`another recovery holds ${recovery}; wait for it or inspect that directory by hand`)
  }
  const token = newToken(Date.now)
  try {
    writeFileSync(join(recovery, 'owner'), `${JSON.stringify({ schema: 1, token, pid: process.pid, at: new Date().toISOString() })}\n`, { flag: 'wx' })
    const inspection = inspectLock(path)
    if (inspection.state === 'missing') throw new Error(`the ${scope} lock at ${path} is missing`)
    if (inspection.state === 'corrupt') throw new Error(`the ${scope} lock at ${path} has no usable owner: ${inspection.reason ?? 'corrupt owner'}`)
    if (inspection.state === 'alive') throw new Error(`the ${scope} lock at ${path} is held by live process ${String(inspection.owner.pid)}`)
    if (inspection.owner.token !== options.expectedOwner) {
      throw new Error(`the ${scope} lock at ${path} changed owner; expected token ${options.expectedOwner}, found ${inspection.owner.token}`)
    }
    rmSync(path, { recursive: true, force: true })
    return { recovered: true, scope }
  } finally {
    rmSync(recovery, { recursive: true, force: true })
  }
}

/**
 * Read both lock owners for one change.
 * @param commonDir - git common directory.
 * @param options - store and change.
 * @returns lock facts.
 */
export function inspectApplyLocks(commonDir, options = {}) {
  const out = []
  for (const scope of LOCK_SCOPES) {
    const path = lockPath(commonDir, scope, options)
    const inspection = inspectLock(path)
    out.push({
      scope,
      path,
      held: inspection.state !== 'missing',
      state: inspection.state,
      ...(inspection.reason === undefined ? {} : { reason: inspection.reason }),
      ...(inspection.owner === undefined ? {} : { owner: inspection.owner }),
      ...(inspection.state === 'alive' || inspection.state === 'dead'
        ? { alive: inspection.state === 'alive' }
        : {}),
    })
  }
  return out
}

/**
 * Whether a lock is held by a dead owner.
 * @param entry - inspectApplyLocks entry.
 * @returns true for a dead owner.
 */
export function isDeadLock(entry) {
  return entry?.held === true && entry.alive === false
}
