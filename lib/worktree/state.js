/**
 * Change-scoped apply worktree state.
 *
 * One JSON file per change under the git common directory records the
 * worktree, branch and commit facts. The schema is lifecycle-only: dependency
 * caches, DSH profiles, browsers and ports belong to repository scripts, not
 * this state.
 *
 * @module dsh-openspec-flow/worktree/state
 */

import { spawnSync } from 'node:child_process'
import {
  existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { gitCommonDir, gitTopLevel, reviewKey } from '../review/store.js'

/** The only state schema this module writes. */
export const APPLY_STATE_SCHEMA_VERSION = 1

/** The statuses a state file may carry. */
export const APPLY_STATE_STATUSES = ['active', 'landing', 'archived']

/** The required fields; every one is present in a written state. */
export const APPLY_STATE_FIELDS = [
  'schemaVersion', 'change', 'store', 'mainRoot', 'worktree', 'branch',
  'baseCommit', 'sealedCommit', 'status', 'createdAt', 'lastUsedAt',
  'lockToken', 'lockPid',
]

/** The optional fields; a state without them reads as no cleanup. */
export const APPLY_STATE_OPTIONAL_FIELDS = ['cleanup']

/** The fields a cleanup record may carry. */
export const APPLY_CLEANUP_FIELDS = ['worktreeRemoved', 'branchRemoved', 'at', 'error']

let atomicCounter = 0

/**
 * The apply state root, or undefined outside git.
 * @param projectRoot - absolute project root.
 * @returns the absolute state root.
 */
export function applyStateRoot(projectRoot) {
  const common = gitCommonDir(projectRoot)
  return common === undefined ? undefined : join(common, 'openspec-flow', 'apply')
}

/**
 * The state file for one change, or undefined outside git.
 * @param projectRoot - absolute project root.
 * @param store - optional store id.
 * @param change - change name.
 * @returns the absolute state path.
 */
export function applyStatePath(projectRoot, store, change) {
  const root = applyStateRoot(projectRoot)
  return root === undefined ? undefined : join(root, `${reviewKey(store, change)}.json`)
}

/**
 * The main worktree root as git reports it.
 * @param projectRoot - absolute project root.
 * @returns the absolute main worktree root, or undefined.
 */
export function mainWorktreeRoot(projectRoot) {
  const top = gitTopLevel(projectRoot)
  if (top === undefined) return undefined
  const result = spawnSync('git', ['-C', projectRoot, 'worktree', 'list', '--porcelain'], { encoding: 'utf8' })
  if (result.status !== 0) return top
  const line = result.stdout.split('\n').find((entry) => entry.startsWith('worktree '))
  if (line === undefined) return top
  return resolve(line.slice('worktree '.length))
}

/**
 * Validate one state document.
 * @param state - parsed JSON.
 * @param path - diagnostic path.
 * @returns the validated state.
 * @throws when a field is missing, mistyped, unknown or invalid.
 */
export function validateApplyState(state, path) {
  if (state === null || typeof state !== 'object' || Array.isArray(state)) {
    throw new Error(`apply worktree state at ${path} is not an object`)
  }
  const allowed = new Set([...APPLY_STATE_FIELDS, ...APPLY_STATE_OPTIONAL_FIELDS])
  for (const key of Object.keys(state)) {
    if (!allowed.has(key)) throw new Error(`apply worktree state at ${path} has unknown field '${key}'`)
  }
  if (state.schemaVersion !== APPLY_STATE_SCHEMA_VERSION) {
    throw new Error(`apply worktree state at ${path} has unsupported schemaVersion ${String(state.schemaVersion)}`)
  }
  for (const field of APPLY_STATE_FIELDS) {
    if (!(field in state)) throw new Error(`apply worktree state at ${path} is missing '${field}'`)
  }
  for (const field of ['change', 'mainRoot', 'worktree', 'branch', 'baseCommit', 'createdAt', 'lastUsedAt']) {
    if (typeof state[field] !== 'string' || state[field].trim() === '') {
      throw new Error(`apply worktree state at ${path} has an invalid '${field}'`)
    }
  }
  if (state.store !== null && (typeof state.store !== 'string' || state.store.trim() === '')) {
    throw new Error(`apply worktree state at ${path} has an invalid 'store'`)
  }
  if (state.sealedCommit !== null && (typeof state.sealedCommit !== 'string' || state.sealedCommit.trim() === '')) {
    throw new Error(`apply worktree state at ${path} has an invalid 'sealedCommit'`)
  }
  if (state.lockToken !== null && (typeof state.lockToken !== 'string' || state.lockToken.trim() === '')) {
    throw new Error(`apply worktree state at ${path} has an invalid 'lockToken'`)
  }
  if (state.lockPid !== null && (!Number.isInteger(state.lockPid) || state.lockPid < 1)) {
    throw new Error(`apply worktree state at ${path} has an invalid 'lockPid'`)
  }
  if ((state.lockToken === null) !== (state.lockPid === null)) {
    throw new Error(`apply worktree state at ${path} must set both lockToken and lockPid or neither`)
  }
  if (!APPLY_STATE_STATUSES.includes(state.status)) {
    throw new Error(`apply worktree state at ${path} has invalid status '${String(state.status)}'`)
  }
  if (state.cleanup !== undefined) {
    if (state.cleanup === null || typeof state.cleanup !== 'object' || Array.isArray(state.cleanup)) {
      throw new Error(`apply worktree state at ${path} has an invalid 'cleanup'`)
    }
    for (const key of Object.keys(state.cleanup)) {
      if (!APPLY_CLEANUP_FIELDS.includes(key)) {
        throw new Error(`apply worktree state at ${path} has unknown cleanup field '${key}'`)
      }
    }
    for (const field of ['worktreeRemoved', 'branchRemoved']) {
      if (state.cleanup[field] !== undefined && typeof state.cleanup[field] !== 'boolean') {
        throw new Error(`apply worktree state at ${path} has an invalid cleanup.${field}`)
      }
    }
    for (const field of ['at', 'error']) {
      if (state.cleanup[field] !== undefined && typeof state.cleanup[field] !== 'string') {
        throw new Error(`apply worktree state at ${path} has an invalid cleanup.${field}`)
      }
    }
  }
  return state
}

/**
 * The worktree an apply call should use for this change, or undefined.
 * @param cwd - session working directory.
 * @param store - optional store id.
 * @param change - change name.
 * @returns the worktree path when an active state names an existing checkout.
 */
export function applyWorktreeFor(cwd, store, change) {
  const main = mainWorktreeRoot(cwd)
  if (main === undefined) return undefined
  const state = readApplyState(main, store, change)
  if (state === undefined || state.status !== 'active') return undefined
  return existsSync(state.worktree) ? state.worktree : undefined
}

/**
 * Read one state file, or undefined when absent.
 * @param projectRoot - absolute project root.
 * @param store - optional store id.
 * @param change - change name.
 * @returns the state, or undefined outside git or when absent.
 * @throws when the file exists but is invalid JSON or shape.
 */
export function readApplyState(projectRoot, store, change) {
  const path = applyStatePath(projectRoot, store, change)
  if (path === undefined || !existsSync(path)) return undefined
  let parsed
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error(`cannot parse apply worktree state at ${path}: ${error instanceof Error ? error.message : String(error)}`)
  }
  return validateApplyState(parsed, path)
}

/**
 * Write one state file atomically after validation.
 * @param projectRoot - absolute project root.
 * @param store - optional store id.
 * @param change - change name.
 * @param state - complete state.
 * @returns the path written.
 * @throws outside git or when the state is invalid.
 */
export function writeApplyState(projectRoot, store, change, state) {
  const path = applyStatePath(projectRoot, store, change)
  if (path === undefined) throw new Error('apply worktree state is unavailable outside a git repository')
  validateApplyState(state, path)
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.tmp-${String(process.pid)}-${String(++atomicCounter)}`
  try {
    writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`)
    renameSync(temporary, path)
  } catch (error) {
    try {
      rmSync(temporary, { force: true })
    } catch {
      // The original failure matters.
    }
    throw error
  }
  return path
}
