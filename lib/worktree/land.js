/**
 * Land one plugin-created apply worktree and archive it in one lifecycle
 * critical section.
 *
 * @module dsh-openspec-flow/worktree/land
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { runOpenSpec } from '../openspec.js'
import { acquireLock, lockPath, releaseLock } from './lock.js'
import { applyStatePath, mainWorktreeRoot, readApplyState, writeApplyState } from './state.js'
import { gitCommonDir, reviewDirectory, reviewKey, sha256 } from '../review/store.js'
import { readReview } from '../review/record.js'
import { readPolicy, policyApply } from '../review/policy.js'
import { draftReadiness } from '../review/readiness.js'
import { filterUnrelatedChangeStatus } from '../review/store.js'

/** Git output or throw. */
function git(cwd, args) {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${(result.stderr || result.stdout || '').trim()}`)
  }
  return result.stdout.trim()
}

/** Git success boolean. */
function gitOk(cwd, args) {
  return spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).status === 0
}

/** The land manifest path. */
export function manifestPath(mainRoot, mergeCommit) {
  return join(gitCommonDir(mainRoot), 'openspec-flow', 'landed', `${mergeCommit}.json`)
}

/** The plugin worktree root. */
export function pluginWorktreeRoot(mainRoot) {
  return resolve(join(mainRoot, '.cache', 'openspec-flow', 'worktrees'))
}

/** Whether a path is a plugin-created checkout. */
function isPluginCheckout(mainRoot, worktree) {
  return resolve(worktree).startsWith(`${pluginWorktreeRoot(mainRoot)}/`)
}

/** Main status without other changes' planning files. */
function mainIsClean(mainRoot, change) {
  const status = git(mainRoot, ['status', '--porcelain'])
  const changePath = `openspec/changes/${change}`
  return filterUnrelatedChangeStatus(status, changePath).length === 0
}

/** The required tree for land. */
function requiredTree(mainRoot, store, change, featureTree) {
  const directory = reviewDirectory(mainRoot, store, change)
  const policy = readPolicy(directory)
  const enabled = policy !== undefined && policyApply(policy).enabled
  if (!enabled) return { tree: featureTree, record: undefined }
  const record = readReview(directory, 'apply')
  if (record === undefined) throw new Error('the apply review has not started; run openspec_review action=start review=apply')
  const readiness = draftReadiness(record, featureTree, 'apply')
  if (!readiness.ready) {
    throw new Error(`the apply review is not ready: ${readiness.reasons.join('; ')}`)
  }
  return { tree: record.treeSha, record }
}

/** Archive and commit in main. */
async function archiveAndCommit(ctx, settings, mainRoot, change, store, mergeCommit, signal) {
  const listArgs = ['list', '--json']
  if (store !== undefined) listArgs.push('--store', store)
  const list = await runOpenSpec(ctx, settings, mainRoot, listArgs, signal)
  const entry = Array.isArray(list.json.changes)
    ? list.json.changes.find((candidate) => candidate.name === change)
    : undefined
  if (entry !== undefined && Number(entry.completedTasks) < Number(entry.totalTasks)) {
    throw new Error(`change '${change}' still has incomplete tasks`)
  }
  const args = ['archive', change, '--yes', '--json']
  if (store !== undefined) args.push('--store', store)
  const { json } = await runOpenSpec(ctx, settings, mainRoot, args, signal)
  const archive = json.archive
  if (archive === null || archive === undefined || typeof archive !== 'object') {
    throw new Error('openspec archive returned no archive result')
  }
  const archivePath = resolve(mainRoot, archive.path)
  const paths = [relative(mainRoot, archivePath), join('openspec', 'changes', change), 'openspec/specs']
  git(mainRoot, ['add', '-A', '--', ...paths])
  const staged = git(mainRoot, ['diff', '--cached', '--name-only'])
  if (staged === '') throw new Error('archive produced no staged changes')
  git(mainRoot, ['commit', '-m', `chore(openspec): archive ${change} via land ${mergeCommit.slice(0, 8)}`])
  return { archive, archiveCommit: git(mainRoot, ['rev-parse', 'HEAD']) }
}

/**
 * Land one worktree.
 * @param ctx - host context.
 * @param settings - plugin settings.
 * @param options - change, store, approvedBy, signal.
 * @returns the land result.
 */
export async function landApplyWorktree(ctx, settings, options) {
  const { change, store, signal } = options
  if (options.approvedBy !== 'user') throw new Error('land requires approvedBy: "user"')
  const cwd = options.cwd
  const mainRoot = mainWorktreeRoot(cwd) ?? cwd
  const common = gitCommonDir(mainRoot)
  if (common === undefined) throw new Error('land is unavailable outside a git repository')
  const state = readApplyState(mainRoot, store, change)
  if (state === undefined || (state.status !== 'active' && state.status !== 'landing')) {
    throw new Error(`land requires an active or landing state for '${change}'`)
  }
  if (!isPluginCheckout(mainRoot, state.worktree)) throw new Error('land only handles a plugin-created apply worktree')
  if (existsSync(manifestPath(mainRoot, git(mainRoot, ['rev-parse', 'HEAD'])))) {
    return { change, ...JSON.parse(readFileSync(manifestPath(mainRoot, git(mainRoot, ['rev-parse', 'HEAD'])), 'utf8')) }
  }
  if (git(mainRoot, ['symbolic-ref', '--short', 'HEAD']) !== 'main') throw new Error('land requires main on branch main')
  if (!mainIsClean(mainRoot, change)) throw new Error('land requires a clean main worktree')
  if (git(state.worktree, ['status', '--porcelain']) !== '') throw new Error('land requires a clean worktree')

  const mainHead = git(mainRoot, ['rev-parse', 'HEAD'])
  const featureHead = git(state.worktree, ['rev-parse', 'HEAD'])
  const featureTree = git(state.worktree, ['rev-parse', 'HEAD^{tree}'])
  if (!gitOk(mainRoot, ['merge-base', '--is-ancestor', mainHead, featureHead])) {
    throw new Error('the worktree is behind main; rebase, retest and re-review before landing')
  }
  const required = requiredTree(mainRoot, store, change, featureTree)
  if (required.tree !== featureTree) throw new Error('the apply review tree does not match the worktree head')

  const lock = await acquireLock(common, 'change', {
    store, change, what: `land:${change}`, reuseToken: state.lockToken ?? undefined, reclaimDead: true,
  })
  const landing = { ...state, status: 'landing', lockToken: lock.owner.token, lockPid: lock.owner.pid }
  writeApplyState(mainRoot, store, change, landing)
  let lifecycle
  let changeLock
  let merged = false
  let archiveResult
  try {
    const released = releaseLock(lock)
    if (released.released !== true) throw new Error('the apply change lock changed owner; recover it before landing')
    lifecycle = await acquireLock(common, 'lifecycle', { what: `land:${change}` })
    changeLock = await acquireLock(common, 'change', { store, change, what: `land:${change}` })
    writeApplyState(mainRoot, store, change, {
      ...landing, lockToken: changeLock.owner.token, lockPid: changeLock.owner.pid,
    })

    git(mainRoot, ['merge', '--no-ff', state.branch, '-m', `feat: land ${change}`])
    merged = true
    const mergeCommit = git(mainRoot, ['rev-parse', 'HEAD'])
    archiveResult = await archiveAndCommit(ctx, settings, mainRoot, change, store, mergeCommit, signal)
    const recordFile = join(reviewDirectory(mainRoot, store, change), 'apply-review.json')
    const manifest = {
      change,
      store: store ?? undefined,
      worktree: state.worktree,
      branch: state.branch,
      featureHead,
      featureTree,
      mergeCommit,
      mainHead,
      archiveCommit: archiveResult.archiveCommit,
      applyReviewId: required.record?.id ?? undefined,
      reviewRecordHash: existsSync(recordFile) ? sha256(readFileSync(recordFile, 'utf8')) : undefined,
      approvedBy: 'user',
      landedAt: new Date().toISOString(),
    }
    const manifestFile = manifestPath(mainRoot, manifest.mergeCommit)
    mkdirSync(dirname(manifestFile), { recursive: true })
    writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`)
    writeApplyState(mainRoot, store, change, {
      ...state, status: 'archived', lockToken: null, lockPid: null, lastUsedAt: new Date().toISOString(),
    })
    return { change, ...manifest, manifest: manifestFile }
  } catch (error) {
    if (!merged) {
      try {
        writeApplyState(mainRoot, store, change, {
          ...state, status: 'active', lockToken: changeLock?.owner.token ?? null, lockPid: changeLock?.owner.pid ?? null,
        })
      } catch {
        // The original failure matters.
      }
    }
    throw error
  } finally {
    if (changeLock !== undefined) releaseLock(changeLock)
    if (lifecycle !== undefined) releaseLock(lifecycle)
  }
}

/**
 * Remove an archived plugin checkout.
 * @param ctx - host context.
 * @param settings - plugin settings.
 * @param options - change, store, abandon, reason, approvedBy.
 * @returns the removal result.
 */
export async function removeApplyWorktree(ctx, settings, options) {
  const { change, store, abandon, reason, approvedBy } = options
  const cwd = options.cwd
  const mainRoot = mainWorktreeRoot(cwd) ?? cwd
  const common = gitCommonDir(mainRoot)
  if (common === undefined) throw new Error('remove is unavailable outside a git repository')
  const state = readApplyState(mainRoot, store, change)
  if (state === undefined) throw new Error(`no apply worktree state for '${change}'`)
  if (!isPluginCheckout(mainRoot, state.worktree)) throw new Error('remove only handles a plugin-created apply worktree')
  if (state.status !== 'archived') {
    if (abandon !== true) throw new Error('remove requires an archived state or abandon with approvedBy: "user" and a reason')
    if (approvedBy !== 'user' || typeof reason !== 'string' || reason.trim() === '') {
      throw new Error('abandon requires approvedBy: "user" and a reason')
    }
  }
  if (state.status === 'active') {
    const released = releaseLock({
      path: lockPath(common, 'change', { store, change }),
      owner: { token: state.lockToken },
      scope: 'change',
      commonDir: common,
    })
    if (released.released !== true) throw new Error('the apply change lock changed owner; recover it before removing')
  }
  const lifecycle = await acquireLock(common, 'lifecycle', { what: `remove:${change}` })
  try {
    const changeLock = await acquireLock(common, 'change', { store, change, what: `remove:${change}` })
    try {
      if (git(state.worktree, ['status', '--porcelain']) !== '') throw new Error('remove requires a clean worktree')
      git(mainRoot, ['worktree', 'remove', '--force', state.worktree])
      rmSync(applyStatePath(mainRoot, store, change), { force: true })
      return { removed: true, path: state.worktree, branch: state.branch }
    } finally {
      releaseLock(changeLock)
    }
  } finally {
    releaseLock(lifecycle)
  }
}
