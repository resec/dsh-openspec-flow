/**
 * Shared rule for publishing a landed worktree change to `origin/main`.
 *
 * A manifest land commit is publishable only when it is already on the remote
 * main, or when the change has a recorded offline land and the caller allows
 * the offline route. Plain reviewed commits before a fast-forward land commit
 * are not manifest entries and must not be refused.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'

import { findLocalEntry, resolvePaths, writeJsonAtomic } from './pr-review-watch.mjs'

/** Directory under the git common directory that holds landed manifests. */
export const LANDED_DIRECTORY = 'openspec-flow/landed'

/** Offline-land record file next to the local owner state. */
export const OFFLINE_LAND_FILE = 'offline-lands.json'

/** SHA-1 object id. */
const OBJECT_ID = /^[0-9a-f]{40}$/iu

/** Zero object id, used for a branch deletion. */
const ZERO_OBJECT_ID = /^0{40}$/u

/** A refused landed push. */
export class LandedPushError extends Error {
  /**
   * @param message - refusal diagnostic.
   */
  constructor(message) {
    super(message)
    this.name = 'LandedPushError'
  }
}

/**
 * Run git in one checkout.
 * @param cwd - repository directory.
 * @param args - git arguments.
 * @param options - `allowFailure` returns the result instead of throwing.
 * @returns the spawn result.
 */
function runGit(cwd, args, options = {}) {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status !== 0 && options.allowFailure !== true) {
    throw new Error(`git ${args.join(' ')} failed: ${(result.stderr || '').trim()}`)
  }
  return result
}

/**
 * Whether one commit is an ancestor of another, including equality.
 * @param cwd - repository directory.
 * @param ancestor - candidate ancestor.
 * @param descendant - candidate descendant.
 * @returns true when git reports containment.
 */
export function isAncestor(cwd, ancestor, descendant) {
  return runGit(cwd, ['merge-base', '--is-ancestor', ancestor, descendant], { allowFailure: true }).status === 0
}

/**
 * Resolve the landed commit from the new field or the legacy merge field.
 * @param manifest - parsed manifest.
 * @returns lower-case commit id, or undefined.
 */
function resolveLandCommit(manifest) {
  const value = typeof manifest.landCommit === 'string' && manifest.landCommit.trim() !== ''
    ? manifest.landCommit
    : manifest.mergeCommit
  return typeof value === 'string' && OBJECT_ID.test(value) ? value.toLowerCase() : undefined
}

/**
 * Normalize one readable manifest to the fields this guard needs.
 * @param manifest - parsed JSON object.
 * @param file - manifest path for diagnostics.
 * @returns normalized entry, or undefined for an invalid record.
 */
function normalizeManifest(manifest, file) {
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) return undefined
  if (typeof manifest.change !== 'string' || manifest.change.trim() === '') return undefined
  if (typeof manifest.archiveCommit !== 'string' || !OBJECT_ID.test(manifest.archiveCommit)) return undefined
  if (typeof manifest.featureTree !== 'string' || !OBJECT_ID.test(manifest.featureTree)) return undefined
  const landCommit = resolveLandCommit(manifest)
  if (landCommit === undefined) return undefined
  return {
    file,
    change: manifest.change,
    archiveCommit: manifest.archiveCommit.toLowerCase(),
    featureTree: manifest.featureTree.toLowerCase(),
    landCommit,
  }
}

/**
 * Read every readable landed manifest under the git common directory.
 * @param root - main worktree.
 * @returns normalized manifest entries.
 */
export function readLandedManifests(root) {
  const commonDir = resolvePaths(root).commonDir
  if (commonDir === undefined) throw new LandedPushError(`${root} is not a git repository`)
  const directory = join(commonDir, LANDED_DIRECTORY)
  if (!existsSync(directory)) return []
  const entries = []
  for (const name of readdirSync(directory).filter((value) => value.endsWith('.json')).sort()) {
    const file = join(directory, name)
    let manifest
    try {
      manifest = JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      continue
    }
    const normalized = normalizeManifest(manifest, file)
    if (normalized !== undefined) entries.push(normalized)
  }
  return entries
}

/**
 * Resolve the offline-land record file.
 * @param root - main worktree.
 * @returns absolute path.
 */
export function offlineLandsPath(root) {
  return join(dirname(resolvePaths(root).localState), OFFLINE_LAND_FILE)
}

/**
 * Read the offline-land state, treating an absent file as empty.
 * @param root - main worktree.
 * @returns `{ schemaVersion: 1, lands: {} }`-shaped state.
 */
export function readOfflineLands(root) {
  const file = offlineLandsPath(root)
  if (!existsSync(file)) return { schemaVersion: 1, lands: {} }
  let state
  try {
    state = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    throw new LandedPushError(`the offline-land state at ${file} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (state === null || typeof state !== 'object' || Array.isArray(state)
    || state.schemaVersion !== 1 || state.lands === null || typeof state.lands !== 'object' || Array.isArray(state.lands)) {
    throw new LandedPushError(`the offline-land state at ${file} is corrupt`)
  }
  return state
}

/**
 * Write the offline-land state atomically.
 * @param root - main worktree.
 * @param state - complete state object.
 */
export function writeOfflineLands(root, state) {
  writeJsonAtomic(offlineLandsPath(root), state)
}

/**
 * Read one offline-land record.
 * @param root - main worktree.
 * @param landCommit - resolved land commit.
 * @returns the record, or undefined.
 */
export function readOfflineRecord(root, landCommit) {
  return readOfflineLands(root).lands[landCommit]
}

/**
 * Remove one offline-land record when present.
 * @param root - main worktree.
 * @param landCommit - resolved land commit.
 * @returns true when a record was removed.
 */
export function clearOfflineRecord(root, landCommit) {
  const state = readOfflineLands(root)
  if (state.lands[landCommit] === undefined) return false
  delete state.lands[landCommit]
  writeOfflineLands(root, state)
  return true
}

/**
 * Whether a manifest has an offline-land record or a landed-offline local phase.
 * @param root - main worktree.
 * @param manifest - normalized manifest.
 * @returns true when the offline route is recorded for this land.
 */
export function hasOfflineLand(root, manifest) {
  let entry
  try {
    entry = findLocalEntry(root, { change: manifest.change })
  } catch {
    entry = undefined
  }
  if (entry?.phase === 'landed-offline'
    && typeof entry.tree === 'string'
    && entry.tree.toLowerCase() === manifest.featureTree) {
    return true
  }
  const record = readOfflineRecord(root, manifest.landCommit)
  if (record === undefined || record === null || typeof record !== 'object') return false
  return record.change === manifest.change
    && typeof record.archiveCommit === 'string'
    && record.archiveCommit.toLowerCase() === manifest.archiveCommit
    && typeof record.featureTree === 'string'
    && record.featureTree.toLowerCase() === manifest.featureTree
}

/**
 * Refuse an unmerged landed range unless the offline route is allowed and recorded.
 * @param options - root, base, tip and whether `--offline` was passed.
 * @returns `{ checked, allowed: true }` when the range is allowed.
 * @throws {LandedPushError} when a manifest land commit is not on the base.
 */
export function assertPushRange({ root, base, tip, allowOffline = false } = {}) {
  if (typeof root !== 'string' || root.trim() === '') throw new LandedPushError('the repository root is required')
  if (typeof base !== 'string' || !OBJECT_ID.test(base)) throw new LandedPushError(`invalid push base '${String(base)}'`)
  if (typeof tip !== 'string' || !OBJECT_ID.test(tip)) throw new LandedPushError(`invalid push tip '${String(tip)}'`)
  if (ZERO_OBJECT_ID.test(base)) return { checked: 0, allowed: true }
  if (base === tip) return { checked: 0, allowed: true }

  const failures = []
  let checked = 0
  for (const manifest of readLandedManifests(root)) {
    const landInRange = isAncestor(root, manifest.landCommit, tip) && !isAncestor(root, manifest.landCommit, base)
    const archiveInRange = isAncestor(root, manifest.archiveCommit, tip) && !isAncestor(root, manifest.archiveCommit, base)
    if (!landInRange && !archiveInRange) continue
    checked += 1
    if (isAncestor(root, manifest.landCommit, base)) continue
    const offline = hasOfflineLand(root, manifest)
    if (allowOffline && offline) continue
    const command = 'node scripts/push-landed.mjs --push --offline'
    const detail = offline
      ? `the change has a recorded offline land; run \`${command}\` to publish the deferred push`
      : `publish it through pr-publish and merge the pull request, or record the offline land and run \`${command}\``
    failures.push(`land commit ${manifest.landCommit} for change ${manifest.change} (manifest ${manifest.file}) is not on origin/main; ${detail} (see docs/local-pr.md)`)
  }
  if (failures.length > 0) throw new LandedPushError(failures.join('\n'))
  return { checked, allowed: true }
}
