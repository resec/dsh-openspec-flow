/**
 * Create or reuse the per-change apply worktree.
 *
 * @module dsh-openspec-flow/worktree/create
 */

import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import { gitCommonDir, reviewKey } from '../review/store.js'
import { acquireLock, releaseLock } from './lock.js'
import { readRecord } from '../toolchain-record.js'
import {
  applyStatePath,
  readApplyState,
  writeApplyState,
} from './state.js'

/**
 * The state key for one change.
 * @param store - optional store id.
 * @param change - change name.
 * @returns the key.
 */
export function applyWorktreeKey(store, change) {
  return reviewKey(store, change)
}

/**
 * The plugin-created worktree path.
 * @param mainRoot - main worktree root.
 * @param store - optional store id.
 * @param change - change name.
 * @returns the absolute path.
 */
export function applyWorktreePath(mainRoot, store, change) {
  return join(mainRoot, '.cache', 'openspec-flow', 'worktrees', applyWorktreeKey(store, change))
}

/**
 * The branch for one worktree.
 * @param store - optional store id.
 * @param change - change name.
 * @returns a git-safe branch name.
 */
export function applyWorktreeBranch(store, change) {
  const key = applyWorktreeKey(store, change)
  const slug = key.replace(/[^A-Za-z0-9_-]/gu, '-')
  const hash = createHash('sha256').update(key).digest('hex').slice(0, 8)
  return `openspec/apply/${slug}-${hash}`
}

/** Run git and return stdout, or throw. */
function git(cwd, args) {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${(result.stderr || result.stdout || '').trim()}`)
  }
  return result.stdout
}

/** Whether git can see the path. */
function gitSucceeds(cwd, args) {
  return spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).status === 0
}

/** Ensure the plugin worktree root is ignored locally. */
function ensureWorktreeIgnore(mainRoot) {
  const reported = git(mainRoot, ['rev-parse', '--git-path', 'info/exclude']).trim()
  const exclude = resolve(mainRoot, reported)
  mkdirSync(dirname(exclude), { recursive: true })
  const pattern = '.cache/openspec-flow/worktrees/'
  let current = ''
  try {
    current = readFileSync(exclude, 'utf8')
  } catch {
    current = ''
  }
  if (current.split('\n').includes(pattern)) return
  writeFileSync(exclude, `${current}${current === '' || current.endsWith('\n') ? '' : '\n'}${pattern}\n`)
}

/**
 * Create or reuse the apply worktree and move the session there.
 * @param ctx - host context.
 * @param options - mainRoot, store, change, sealCommit, what, signal.
 * @returns the active state.
 */
export async function createOrReuseApplyWorktree(ctx, options) {
  const { mainRoot, store, change, sealCommit, agent, signal, prepareEnvironment } = options
  const common = gitCommonDir(mainRoot)
  if (common === undefined) throw new Error('apply worktree creation is unavailable outside a git repository')
  const path = applyWorktreePath(mainRoot, store, change)
  const branch = applyWorktreeBranch(store, change)
  const existing = readApplyState(mainRoot, store, change)
  if (existing !== undefined) {
    if (existing.status === 'landing') {
      throw new Error(`the apply worktree for ${change} is landing; wait for land to finish`)
    }
    if (existing.status !== 'active') {
      throw new Error(`the apply worktree state for ${change} is ${existing.status}; it cannot be reused`)
    }
    if (existing.worktree !== path || existing.branch !== branch) {
      throw new Error(`the apply worktree state for ${change} names a different worktree; inspect it before creating another`)
    }
    if (!existsSync(path)) {
      throw new Error(`the apply worktree state for ${change} names a missing worktree at ${path}; repair it first`)
    }
    const lock = await acquireLock(common, 'change', {
      store,
      change,
      what: `apply:${change}`,
      reuseToken: existing.lockToken ?? undefined,
      reclaimDead: true,
    })
    const updated = lock.owner.token === existing.lockToken && lock.owner.pid === existing.lockPid
      ? existing
      : { ...existing, lockToken: lock.owner.token, lockPid: lock.owner.pid }
    if (updated !== existing) writeApplyState(mainRoot, store, change, updated)
    if (prepareEnvironment !== undefined) {
      const record = readRecord(path)
      if (record.state !== 'current') {
        try {
          await prepareEnvironment({ worktree: path, signal })
        } catch (error) {
          releaseLock(lock)
          throw error
        }
      }
    }
    await moveSession(ctx, agent, path, signal)
    return updated
  }
  const lock = await acquireLock(common, 'change', {
    store,
    change,
    what: `apply:${change}`,
    reclaimDead: true,
  })
  let moved = false
  let createdWorktree = false
  let createdBranch = false
  let wroteState = false
  try {
    ensureWorktreeIgnore(mainRoot)
    if (gitSucceeds(mainRoot, ['rev-parse', '--verify', `refs/heads/${branch}`])) {
      const tip = git(mainRoot, ['rev-parse', `refs/heads/${branch}`]).trim()
      if (tip !== sealCommit) {
        throw new Error(`the apply branch '${branch}' does not point at the seal commit; remove that worktree and branch before applying again`)
      }
      git(mainRoot, ['worktree', 'add', path, branch])
    } else {
      git(mainRoot, ['worktree', 'add', '-b', branch, path, sealCommit])
      createdBranch = true
    }
    createdWorktree = true
    if (prepareEnvironment !== undefined) {
      await prepareEnvironment({ worktree: path, signal })
    }
    await moveSession(ctx, agent, path, signal)
    moved = true
    const now = new Date().toISOString()
    const state = {
      schemaVersion: 1,
      change,
      store: store ?? null,
      mainRoot,
      worktree: path,
      branch,
      baseCommit: sealCommit,
      sealedCommit: sealCommit,
      status: 'active',
      createdAt: now,
      lastUsedAt: now,
      lockToken: lock.owner.token,
      lockPid: lock.owner.pid,
    }
    writeApplyState(mainRoot, store, change, state)
    wroteState = true
    return state
  } catch (error) {
    if (moved) {
      try {
        await moveSession(ctx, agent, mainRoot, signal)
      } catch {
        // The original failure matters.
      }
    }
    if (createdWorktree) {
      gitSucceeds(mainRoot, ['worktree', 'remove', '--force', path])
      rmSync(path, { recursive: true, force: true })
    }
    if (createdBranch) gitSucceeds(mainRoot, ['branch', '-D', branch])
    if (wroteState) {
      try {
        rmSync(applyStatePath(mainRoot, store, change), { force: true })
      } catch {
        // The original failure matters.
      }
    }
    releaseLock(lock)
    throw error
  }
}

/** Move the current session, when the Host exposes a setter. */
async function moveSession(ctx, agent, path, signal) {
  if (ctx?.workingDirectory?.set === undefined) {
    throw new Error('the Host working-directory service cannot move the session; apply was not started')
  }
  if (agent === undefined) {
    throw new Error('apply requires an agent session to move into the worktree')
  }
  await ctx.workingDirectory.set(agent, path, signal)
}
