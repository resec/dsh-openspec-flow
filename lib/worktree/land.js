/**
 * Land one plugin-created apply worktree and archive it in one lifecycle
 * critical section.
 *
 * @module dsh-openspec-flow/worktree/land
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { runOpenSpec } from '../openspec.js'
import { archiveInProject } from '../archive.js'
import { acquireLock, acquireOrdered, inspectLock, lockPath, releaseLock } from './lock.js'
import { applyStatePath, mainWorktreeRoot, readApplyState, writeApplyState } from './state.js'
import { gitCommonDir, reviewDirectory, sha256, withReviewLock } from '../review/store.js'
import { latestExtraRound, readReview, saveReview } from '../review/record.js'
import { readPolicy, policyApply } from '../review/policy.js'
import { draftReadiness } from '../review/readiness.js'
import { filterUnrelatedChangeStatus } from '../review/store.js'
import { nearestProjectRoot } from '../review/apply-lock.js'

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
export function manifestPath(mainRoot, landCommit) {
  return join(gitCommonDir(mainRoot), 'openspec-flow', 'landed', `${landCommit}.json`)
}

/** The plugin worktree root. */
export function pluginWorktreeRoot(mainRoot) {
  return resolve(join(mainRoot, '.cache', 'openspec-flow', 'worktrees'))
}

/** Whether a path is a plugin-created checkout. */
function isPluginCheckout(mainRoot, worktree) {
  return resolve(worktree).startsWith(`${pluginWorktreeRoot(mainRoot)}/`)
}

/** Read the tree of a revision. */
function treeOf(cwd, rev) {
  return git(cwd, ['rev-parse', `${rev}^{tree}`])
}

/** Verify a revision carries the required tree, without changing main. */
function assertTreeAt(cwd, rev, requiredTree) {
  if (treeOf(cwd, rev) !== requiredTree) {
    throw new Error('the tree differs from the required tree; land aborted')
  }
}

/** Verify the current main tree equals the required tree without resetting main. */
export function assertLandedTree(mainRoot, requiredTree) {
  assertTreeAt(mainRoot, 'HEAD', requiredTree)
}

/** The commit recorded in a new or legacy landed manifest. */
function landedCommit(manifest) {
  return manifest.landCommit ?? manifest.mergeCommit
}

/** Resolve the OpenSpec root through the CLI. */
async function openspecRoot(ctx, settings, mainRoot, store, signal) {
  const args = ['list', '--json']
  if (store !== undefined) args.push('--store', store)
  const list = await runOpenSpec(ctx, settings, mainRoot, args, signal)
  const root = typeof list.json.root?.path === 'string' && list.json.root.path !== ''
    ? list.json.root.path
    : mainRoot
  return { root, list: list.json }
}

/** Main status without the landed change's own planning files. */
function mainIsClean(mainRoot, root, change) {
  const status = git(mainRoot, ['status', '--porcelain'])
  const changePath = relative(mainRoot, join(root, 'openspec', 'changes', change))
  return filterUnrelatedChangeStatus(status, changePath).length === 0
}

/** The required tree for land. */
function requiredTree(mainRoot, store, change, featureTree) {
  const directory = reviewDirectory(mainRoot, store, change)
  const policy = readPolicy(directory)
  const enabled = policy !== undefined && policyApply(policy).enabled
  if (!enabled) return { tree: featureTree, record: undefined, marker: undefined }
  const record = readReview(directory, 'apply')
  if (record === undefined) throw new Error('the apply review has not started; run openspec_review action=start review=apply')
  const marker = record.rebaseReview
  const extra = latestExtraRound(record)
  if (marker !== undefined) {
    if (extra !== undefined) {
      const extraReadiness = draftReadiness(record, extra.treeSha, 'apply')
      if (extraReadiness.ready) return { tree: extra.treeSha, record, marker }
    }
    if (featureTree === marker.treeSha) return { tree: featureTree, record, marker }
    throw new Error('the apply review has a rebase marker; run openspec_review action=resume review=apply and complete the extra round before landing')
  }
  const readiness = draftReadiness(record, featureTree, 'apply')
  if (!readiness.ready) {
    throw new Error(`the apply review is not ready: ${readiness.reasons.join('; ')}`)
  }
  return { tree: record.treeSha, record, marker: undefined }
}

/** Write the rebase-review marker while owning the change lock. */
function recordRebaseMarker(options) {
  const { mainRoot, store, change, state, mainHead, featureHead, required } = options
  if (required.record === undefined) return
  const common = gitCommonDir(mainRoot)
  const live = inspectLock(lockPath(common, 'change', { store, change }))
  const owns = live.state === 'alive'
    && live.owner.pid === process.pid
    && (state.lockToken === null || live.owner.token === state.lockToken)
  if (!owns) {
    throw new Error('the apply change lock is not owned by this session; recover it before landing')
  }
  const directory = reviewDirectory(mainRoot, store, change)
  withReviewLock(directory, 'rebase-marker', () => {
    const record = readReview(directory, 'apply')
    record.rebaseReview = {
      requiredAt: new Date().toISOString(),
      mainHead,
      worktreeHead: featureHead,
      treeSha: required.tree,
    }
    saveReview(directory, record, 'apply')
  })
}

/** Clear the rebase marker after a completed land; a write conflict is retried. */
function clearRebaseMarker(mainRoot, store, change) {
  const directory = reviewDirectory(mainRoot, store, change)
  try {
    withReviewLock(directory, 'rebase-clear', () => {
      const record = readReview(directory, 'apply')
      if (record === undefined || record.rebaseReview === undefined) return
      delete record.rebaseReview
      saveReview(directory, record, 'apply')
    })
    return true
  } catch {
    return false
  }
}

/** Find the landed manifest for one change. */
function landedManifest(mainRoot, store, change) {
  const directory = join(gitCommonDir(mainRoot), 'openspec-flow', 'landed')
  if (!existsSync(directory)) return undefined
  for (const name of readdirSync(directory)) {
    if (!name.endsWith('.json')) continue
    try {
      const manifest = JSON.parse(readFileSync(join(directory, name), 'utf8'))
      if (manifest.change === change && (manifest.store ?? null) === (store ?? null)) return manifest
    } catch {
      // Ignore an unreadable manifest.
    }
  }
  return undefined
}

/** Remove the landed worktree and branch, recording the outcome. */
function cleanupLandedWorktree(mainRoot, store, change, state) {
  const cleanup = { ...(state.cleanup ?? {}) }
  let error
  if (cleanup.worktreeRemoved !== true) {
    try {
      if (existsSync(state.worktree)) git(mainRoot, ['worktree', 'remove', '--force', state.worktree])
      cleanup.worktreeRemoved = true
    } catch (cause) {
      cleanup.worktreeRemoved = false
      error = cause instanceof Error ? cause.message : String(cause)
    }
  }
  if (cleanup.branchRemoved !== true) {
    try {
      if (gitOk(mainRoot, ['rev-parse', '--verify', `refs/heads/${state.branch}`])) {
        git(mainRoot, ['branch', '-d', state.branch])
      }
      cleanup.branchRemoved = true
    } catch (cause) {
      cleanup.branchRemoved = false
      error ??= cause instanceof Error ? cause.message : String(cause)
    }
  }
  cleanup.at = new Date().toISOString()
  if (error === undefined) delete cleanup.error
  else cleanup.error = error
  writeApplyState(mainRoot, store, change, { ...state, cleanup })
  return {
    complete: cleanup.worktreeRemoved === true && cleanup.branchRemoved === true,
    worktreeRemoved: cleanup.worktreeRemoved === true,
    branchRemoved: cleanup.branchRemoved === true,
    ...(error === undefined ? {} : { error }),
  }
}

/** Validate strict and archive through the shared archive operation. */
async function archiveChange(ctx, settings, root, change, store, signal) {
  const result = await archiveInProject(ctx, settings, root, change, store, signal)
  if (!result.valid) throw new Error(`openspec validate refused '${change}'`)
  return result.json.archive
}

/** Stage and commit an archive. */
function commitArchive(mainRoot, root, change, landCommit, archive) {
  const archivePath = resolve(root, archive.path)
  const archiveRelative = relative(mainRoot, archivePath)
  const specsRelative = relative(mainRoot, join(root, 'openspec', 'specs'))
  const changeRelative = relative(mainRoot, join(root, 'openspec', 'changes', change))
  git(mainRoot, ['add', '-A', '--', archiveRelative, specsRelative])
  git(mainRoot, ['rm', '-r', '--cached', '--ignore-unmatch', '-q', '--', changeRelative])
  if (git(mainRoot, ['diff', '--cached', '--name-only']) === '') {
    throw new Error('archive produced no staged changes')
  }
  git(mainRoot, ['commit', '-m', `chore(openspec): archive ${change} via land ${landCommit.slice(0, 8)}`])
  return git(mainRoot, ['rev-parse', 'HEAD'])
}

/** Write the manifest and archive state. */
function finishLand(mainRoot, store, change, state, facts) {
  const recordFile = join(reviewDirectory(mainRoot, store, change), 'apply-review.json')
  const manifest = {
    change,
    store: store ?? null,
    worktree: state.worktree,
    branch: state.branch,
    featureHead: facts.featureHead,
    featureTree: facts.featureTree,
    landCommit: facts.landCommit,
    landMode: facts.landCommit === facts.featureHead ? 'fast-forward' : 'legacy-merge',
    mainHead: facts.mainHead,
    archiveCommit: facts.archiveCommit,
    applyReviewId: facts.record?.id ?? null,
    reviewRecordHash: existsSync(recordFile) ? sha256(readFileSync(recordFile, 'utf8')) : null,
    approvedBy: 'user',
    landedAt: new Date().toISOString(),
  }
  const manifestFile = manifestPath(mainRoot, manifest.landCommit)
  mkdirSync(dirname(manifestFile), { recursive: true })
  writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`)
  const archived = {
    ...state, status: 'archived', lockToken: null, lockPid: null, lastUsedAt: new Date().toISOString(),
  }
  writeApplyState(mainRoot, store, change, archived)
  if (!clearRebaseMarker(mainRoot, store, change)) {
    // A concurrent review write holds the lock; retry after the cleanup.
    clearRebaseMarker(mainRoot, store, change)
  }
  const cleanup = cleanupLandedWorktree(mainRoot, store, change, archived)
  return {
    change,
    landCommit: facts.landCommit,
    mergeCommit: facts.landCommit,
    cleanup,
    archiveCommit: facts.archiveCommit,
    manifest: manifestFile,
    worktree: manifest.worktree,
    branch: manifest.branch,
    featureHead: manifest.featureHead,
    featureTree: manifest.featureTree,
    mainHead: manifest.mainHead,
    approvedBy: manifest.approvedBy,
    landedAt: manifest.landedAt,
  }
}

/** Find a completed fast-forward or legacy merge that already carries the required tree. */
function findLanding(mainRoot, required, branchHead) {
  const head = git(mainRoot, ['rev-parse', 'HEAD'])
  if (head === branchHead) return { landCommit: head, archiveCommit: undefined }
  const parents = git(mainRoot, ['show', '-s', '--format=%P', head]).split(' ').filter(Boolean)
  if (parents.length === 1 && parents[0] === branchHead) {
    return { landCommit: branchHead, archiveCommit: head }
  }
  const isLegacyMerge = (commit) => {
    const commitParents = git(mainRoot, ['show', '-s', '--format=%P', commit]).split(' ').filter(Boolean)
    return commitParents.length === 2 && commitParents.includes(branchHead)
  }
  if (treeOf(mainRoot, head) === required.tree && isLegacyMerge(head)) {
    return { landCommit: head, archiveCommit: undefined }
  }
  if (parents.length === 1) {
    const parent = parents[0]
    if (treeOf(mainRoot, parent) === required.tree && isLegacyMerge(parent)) {
      return { landCommit: parent, archiveCommit: head }
    }
  }
  return undefined
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
  if (state === undefined) throw new Error(`land requires an active or landing state for '${change}'`)
  if (state.status === 'archived') {
    if (!isPluginCheckout(mainRoot, state.worktree)) {
      throw new Error('land only handles a plugin-created apply worktree')
    }
    const manifest = landedManifest(mainRoot, store, change)
    const cleanupDone = state.cleanup?.worktreeRemoved === true && state.cleanup?.branchRemoved === true
    const reviewRecord = readReview(reviewDirectory(mainRoot, store, change), 'apply')
    const markerPending = reviewRecord?.rebaseReview !== undefined
    if (manifest === undefined || (cleanupDone && !markerPending)) {
      throw new Error(`land requires an active or landing state for '${change}'`)
    }
    const priorPath = lockPath(common, 'change', { store, change })
    const prior = inspectLock(priorPath)
    if (prior.state === 'alive' && prior.owner.pid === process.pid) {
      releaseLock({ path: priorPath, owner: prior.owner, scope: 'change', commonDir: common })
    }
    const lifecycle = await acquireLock(common, 'lifecycle', { what: `land-cleanup:${change}` })
    try {
      const changeLock = await acquireLock(common, 'change', { store, change, what: `land-cleanup:${change}` })
      try {
        clearRebaseMarker(mainRoot, store, change)
        const cleanup = cleanupLandedWorktree(mainRoot, store, change, { ...state, lockToken: null, lockPid: null })
        const landCommit = landedCommit(manifest)
        return {
          change,
          landCommit,
          mergeCommit: landCommit,
          archiveCommit: manifest.archiveCommit,
          manifest: manifestPath(mainRoot, landCommit),
          worktree: manifest.worktree,
          branch: manifest.branch,
          cleanup,
        }
      } finally {
        releaseLock(changeLock)
      }
    } finally {
      releaseLock(lifecycle)
    }
  }
  if (state.status !== 'active' && state.status !== 'landing') {
    throw new Error(`land requires an active or landing state for '${change}'`)
  }
  if (!isPluginCheckout(mainRoot, state.worktree)) throw new Error('land only handles a plugin-created apply worktree')
  const worktreeRoot = await openspecRoot(ctx, settings, state.worktree, store, signal)
  const relativeRoot = relative(state.worktree, worktreeRoot.root)
  const discoveryRoot = resolve(mainRoot, relativeRoot)
  const { root } = await openspecRoot(ctx, settings, discoveryRoot, store, signal)
  const featureHead = git(state.worktree, ['rev-parse', 'HEAD'])
  const featureTree = git(state.worktree, ['rev-parse', 'HEAD^{tree}'])
  const required = requiredTree(mainRoot, store, change, featureTree)
  if (required.tree !== featureTree) throw new Error('the apply review tree does not match the worktree head')
  const existing = state.status === 'landing' ? findLanding(mainRoot, required, featureHead) : undefined
  if (existing !== undefined && git(state.worktree, ['status', '--porcelain']) === '') {
    const oldLockPath = lockPath(common, 'change', { store, change })
    const oldLock = inspectLock(oldLockPath)
    if (oldLock.state === 'alive' && oldLock.owner.pid === process.pid && oldLock.owner.token === state.lockToken) {
      releaseLock({ path: oldLockPath, owner: oldLock.owner, scope: 'change', commonDir: common })
    }
    const resumeLocks = await acquireOrdered(common, { store, change, what: `land:${change}` })
    try {

    const landCommit = existing.landCommit
    const mainHead = git(mainRoot, ['rev-parse', `${landCommit}^1`])
    if (existing.archiveCommit === undefined) {
      const archiveRoot = join(root, 'openspec', 'changes', 'archive')
      const archived = existsSync(archiveRoot)
        ? readdirSync(archiveRoot).find((name) => name.endsWith(`-${change}`))
        : undefined
      if (archived !== undefined) {
        // The archive moved the change but its commit failed.
        const archiveCommit = commitArchive(mainRoot, root, change, landCommit, {
          path: join(archiveRoot, archived),
        })
        return finishLand(mainRoot, store, change, state, {
          featureHead, featureTree, landCommit,
          mainHead,
          archiveCommit, record: required.record,
        })
      }
      const archive = await archiveChange(ctx, settings, root, change, store, signal)
      const archiveCommit = commitArchive(mainRoot, root, change, landCommit, archive)
      return finishLand(mainRoot, store, change, state, {
        featureHead, featureTree, landCommit,
        mainHead,
        archiveCommit, record: required.record,
      })
    }
    return finishLand(mainRoot, store, change, state, {
      featureHead, featureTree, landCommit,
      mainHead,
      archiveCommit: existing.archiveCommit, record: required.record,
    })
    } finally {
      releaseLock(resumeLocks.change)
      releaseLock(resumeLocks.lifecycle)
    }
  }
  if (git(mainRoot, ['symbolic-ref', '--short', 'HEAD']) !== 'main') throw new Error('land requires main on branch main')
  if (!mainIsClean(mainRoot, root, change)) throw new Error('land requires a clean main worktree')
  if (git(state.worktree, ['status', '--porcelain']) !== '') throw new Error('land requires a clean worktree')
  const mainHead = git(mainRoot, ['rev-parse', 'HEAD'])
  if (!gitOk(mainRoot, ['merge-base', '--is-ancestor', mainHead, featureHead])) {
    recordRebaseMarker({ mainRoot, store, change, state, mainHead, featureHead, required })
    throw new Error('the worktree is behind main; rebase, retest and re-review before landing')
  }
  if (git(mainRoot, ['rev-list', '--merges', `${mainHead}..${featureHead}`]) !== '') {
    throw new Error('the worktree history contains merge commits; rebase onto main to make it linear, then retest and re-review before landing')
  }
  assertTreeAt(state.worktree, featureHead, required.tree)
  const live = inspectLock(lockPath(common, 'change', { store, change }))
  if (live.state === 'corrupt') throw new Error('the apply change lock is corrupt; recover it before landing')
  if (live.state !== 'missing') {
    if (live.state === 'dead') {
      throw new Error(`the apply change lock is held by dead process ${String(live.owner.pid)}; recover it with openspec_apply_worktree action=recover scope=change expectedOwner=${live.owner.token}`)
    }
    if (live.owner.pid !== state.lockPid || live.owner.token !== state.lockToken || live.owner.pid !== process.pid) {
      throw new Error('the apply change lock is not owned by this session; recover it before landing')
    }
  }
  const lock = await acquireLock(common, 'change', {
    store, change, what: `land:${change}`,
    reuseToken: live.state === 'alive' ? state.lockToken : undefined,
  })
  let lifecycle
  let changeLock
  let merged = false
  let keepChangeLock = false
  try {
    releaseLock(lock)
    lifecycle = await acquireLock(common, 'lifecycle', { what: `land:${change}` })
    changeLock = await acquireLock(common, 'change', { store, change, what: `land:${change}` })
    const landingState = {
      ...state, status: 'landing', lockToken: changeLock.owner.token, lockPid: changeLock.owner.pid,
    }
    writeApplyState(mainRoot, store, change, landingState)
    const currentMainHead = git(mainRoot, ['rev-parse', 'HEAD'])
    if (currentMainHead !== mainHead) {
      recordRebaseMarker({ mainRoot, store, change, state: landingState, mainHead: currentMainHead, featureHead, required })
      throw new Error('the worktree is behind main; rebase, retest and re-review before landing')
    }
    try {
      git(mainRoot, ['merge', '--ff-only', state.branch])
    } catch (error) {
      const movedHead = git(mainRoot, ['rev-parse', 'HEAD'])
      if (movedHead !== mainHead) {
        recordRebaseMarker({ mainRoot, store, change, state: landingState, mainHead: movedHead, featureHead, required })
      }
      throw error
    }
    const landCommit = git(mainRoot, ['rev-parse', 'HEAD'])
    if (landCommit !== featureHead) {
      recordRebaseMarker({ mainRoot, store, change, state: landingState, mainHead: landCommit, featureHead, required })
      throw new Error('main did not fast-forward to the worktree head; the worktree is behind main, so rebase, retest and re-review before landing')
    }
    merged = true
    assertLandedTree(mainRoot, required.tree)
    const archive = await archiveChange(ctx, settings, root, change, store, signal)
    const archiveCommit = commitArchive(mainRoot, root, change, landCommit, archive)
    return finishLand(mainRoot, store, change, state, {
      featureHead, featureTree, landCommit, mainHead, archiveCommit, record: required.record,
    })
  } catch (error) {
    if (!merged && changeLock !== undefined) {
      writeApplyState(mainRoot, store, change, {
        ...state, status: 'active', lockToken: changeLock.owner.token, lockPid: changeLock.owner.pid,
      })
      keepChangeLock = true
    }
    throw error
  } finally {
    if (changeLock !== undefined && !keepChangeLock) releaseLock(changeLock)
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
      if (state.status === 'archived' && state.cleanup?.worktreeRemoved === true) {
        return { removed: false, path: state.worktree, branch: state.branch }
      }
      if (existsSync(state.worktree)) {
        if (git(state.worktree, ['status', '--porcelain']) !== '') throw new Error('remove requires a clean worktree')
        git(mainRoot, ['worktree', 'remove', '--force', state.worktree])
      }
      rmSync(applyStatePath(mainRoot, store, change), { force: true })
      return { removed: true, path: state.worktree, branch: state.branch }
    } finally {
      releaseLock(changeLock)
    }
  } finally {
    releaseLock(lifecycle)
  }
}
