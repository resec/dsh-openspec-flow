#!/usr/bin/env node
/**
 * Retarget, verify and finish the landing of an owner-managed local pull
 * request.
 *
 * After `gh pr merge --rebase`, the reviewed worktree tree survives in the
 * merge commit. This command verifies the merged tree, resets the plugin
 * worktree branch to the merge commit, and records the local landing phases.
 * It never merges, lands or pushes; the owner session calls the plugin land
 * tool and `push-landed` at the recorded steps.
 */

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  loadLocalState,
  mainWorktree,
  resolvePaths,
  updateLocalEntry,
} from './pr-review-watch.mjs'
import {
  acquireLock,
  readLockOwner,
  releaseLock,
} from './pr-review-lock.mjs'
import {
  assertReviewReady,
  findApplyState,
  ghText,
  gitText,
  isPluginWorktree,
  readLandedManifest,
  readPullRequest,
} from './pr-local-shared.mjs'

/** The phases a finish command may record. */
export const FINISH_PHASES = ['landed', 'landed-offline', 'pushed']
/** Phases from which a retarget may start or retry. */
const RETARGETABLE_PHASES = new Set(['published', 'merged', 'failed'])
/** Phases that already completed the retarget. */
const RETARGETED_PHASES = new Set(['retargeted', 'landed', 'landed-offline', 'pushed'])

/** A usage error, mapped to exit code 2. */
class LocalLandUsageError extends Error {
  /** @param message - diagnostic. */
  constructor(message) {
    super(message)
    this.name = 'LocalLandUsageError'
  }
}

/** Git output, throwing on failure. */
function gitOrThrow(git, cwd, args) {
  const text = git(cwd, args)
  if (text === undefined) throw new Error(`git ${args.join(' ')} failed in ${cwd}`)
  return text
}

/** Whether a process exists. */
function processAlive(pid) {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (error?.code === 'ESRCH') return false
    if (error?.code === 'EPERM') return true
    throw error
  }
}

/** Require one local owner entry. */
export function requireLocalEntry(root, number) {
  const n = Number(number)
  if (!Number.isInteger(n) || n < 1) throw new LocalLandUsageError('the PR number must be a positive integer')
  const entry = loadLocalState(root).prs[String(n)]
  if (entry === undefined) throw new Error(`PR #${n} has no local owner entry`)
  return entry
}

/** Require the owner session to match an entry. */
function requireSession(entry, session) {
  if (typeof session !== 'string' || session.trim() === '') {
    throw new LocalLandUsageError('this command needs --session <id>')
  }
  if (entry.ownerSession !== session) {
    throw new Error(`PR #${entry.number} belongs to session ${entry.ownerSession}, not ${session}`)
  }
}

/**
 * Refuse a held landing lock that names another session.
 *
 * A matching session is the primary ownership check. The token is an optional
 * stricter discriminator: when the caller passes one it must match, but the
 * documented session-only commands proceed without it.
 * @returns the lock owner, or undefined when free.
 */
function requireLockOwner({ root, session, token }) {
  const lock = readLockOwner(root)
  if (lock === undefined) return undefined
  if (lock.ownerSession !== session) {
    throw new Error(`the landing lock is held by session ${lock.ownerSession} for PR #${lock.pr}`)
  }
  if (typeof token === 'string' && token.trim() !== '' && token !== lock.token) {
    throw new Error(`the landing lock token does not match the token recorded for session ${session}`)
  }
  return lock
}

/** Require the plugin worktree state for a change. */
export function requireWorktreeState(root, change) {
  const found = findApplyState(root, { change })
  if (found === undefined) throw new Error(`the change ${change} has no apply state; land the worktree first`)
  const state = found.state
  if (typeof state.worktree !== 'string' || !existsSync(state.worktree)) {
    throw new Error(`the change ${change} has no plugin worktree; it is already landed or removed`)
  }
  if (!isPluginWorktree(root, state.worktree)) {
    throw new Error(`the change ${change} worktree ${state.worktree} is not a plugin worktree`)
  }
  return state
}

/**
 * Inspect the plugin change lock for one change.
 * @returns `{ state, owner? }`, where state is `missing`, `dead`, `alive` or `corrupt`.
 */
export function inspectChangeLock(root, state) {
  const common = resolvePaths(root).commonDir
  if (common === undefined) return { state: 'missing' }
  const key = typeof state.store === 'string' && state.store !== ''
    ? `${state.store}#${state.change}`
    : `local#${state.change}`
  const file = join(common, 'openspec-flow', 'changes', `${key}.lock.d`, 'owner')
  if (!existsSync(file)) return { state: 'missing' }
  let owner
  try {
    owner = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return { state: 'corrupt', file }
  }
  if (!Number.isInteger(owner?.pid) || typeof owner?.token !== 'string' || owner.token === '') {
    return { state: 'corrupt', file }
  }
  return { state: processAlive(owner.pid) ? 'alive' : 'dead', owner, file }
}

/**
 * Verify the merge, the reviewed tree and the worktree without writing.
 * @param options - root, PR number, optional session and runners.
 * @returns the verified landing facts.
 */
export function verifyLocal({
  root,
  number,
  session,
  gh = ghText,
  git = gitText,
} = {}) {
  const entry = requireLocalEntry(root, number)
  if (session !== undefined) requireSession(entry, session)
  if (entry.phase === 'pushed') throw new Error(`PR #${entry.number} is already pushed`)
  const state = requireWorktreeState(root, entry.change)
  const worktree = state.worktree
  const pr = readPullRequest({ root, number: entry.number, gh })
  if (pr.state !== 'MERGED') {
    throw new Error(`PR #${entry.number} is ${String(pr.state).toLowerCase()}, not merged; merge it with gh pr merge ${entry.number} --rebase first`)
  }
  const mergeCommit = String(pr.mergeCommit?.oid ?? '')
  if (!/^[0-9a-f]{40}$/iu.test(mergeCommit)) {
    throw new Error(`PR #${entry.number} has no merge commit id`)
  }
  if (git(root, ['fetch', 'origin', 'main'], true) === undefined) {
    throw new Error('cannot fetch origin/main; the merge cannot be verified')
  }
  const originMain = gitOrThrow(git, root, ['rev-parse', 'origin/main'])
  if (originMain !== mergeCommit) {
    throw new Error(`origin/main is ${originMain}, not the merge commit ${mergeCommit}; fetch and reconcile main before retargeting`)
  }
  const mergeTree = gitOrThrow(git, root, ['rev-parse', `${mergeCommit}^{tree}`])
  if (mergeTree !== entry.tree) {
    throw new Error(`the merged tree ${mergeTree} differs from the reviewed tree ${entry.tree}`)
  }
  const record = assertReviewReady({ root, change: entry.change, tree: mergeTree })
  const dirty = gitOrThrow(git, worktree, ['status', '--porcelain'])
  if (dirty !== '') throw new Error(`the plugin worktree ${worktree} is not clean:\n${dirty}`)
  const branch = gitOrThrow(git, worktree, ['symbolic-ref', '--short', 'HEAD'])
  if (typeof state.branch === 'string' && state.branch !== '' && branch !== state.branch) {
    throw new Error(`the plugin worktree is on ${branch}, not the apply branch ${state.branch}`)
  }
  const main = gitOrThrow(git, root, ['rev-parse', 'main'])
  if (git(root, ['merge-base', '--is-ancestor', main, mergeCommit], true) === undefined) {
    throw new Error(`local main ${main} is not an ancestor of the merge commit ${mergeCommit}; fetch and reconcile main`)
  }
  const head = gitOrThrow(git, worktree, ['rev-parse', 'HEAD'])
  return {
    number: entry.number,
    change: entry.change,
    phase: entry.phase,
    head,
    tree: entry.tree,
    mergeCommit,
    mergeTree,
    originMain,
    record,
    worktree,
    branch,
    main,
    state,
  }
}

/** Record a failed local landing command on the owner entry. */
function recordFailure(root, number, error) {
  const entry = loadLocalState(root).prs[String(number)]
  if (entry === undefined) return
  updateLocalEntry(root, number, {
    phase: 'failed',
    error: error instanceof Error ? error.message : String(error),
  })
}

/**
 * Reset the plugin worktree branch to the merge commit.
 * @param options - root, PR number, session, token, apply and runners.
 * @returns the updated entry or a dry-run report.
 */
export function retargetLocal({
  root,
  number,
  session,
  token,
  apply = false,
  gh = ghText,
  git = gitText,
} = {}) {
  const entry = requireLocalEntry(root, number)
  requireSession(entry, session)
  if (RETARGETED_PHASES.has(entry.phase)) return { ...entry, alreadyRetargeted: true }
  if (!RETARGETABLE_PHASES.has(entry.phase)) {
    throw new Error(`PR #${entry.number} is ${entry.phase}; retarget needs a published, merged or failed entry`)
  }
  const lockOwner = requireLockOwner({ root, session, token })
  if (!apply) return { dryRun: true, ...(verifyLocal({ root, number: entry.number, session, gh, git })) }
  let facts
  try {
    facts = verifyLocal({ root, number: entry.number, session, gh, git })
  } catch (error) {
    recordFailure(root, entry.number, error)
    throw error
  }
  updateLocalEntry(root, entry.number, { phase: 'merged', error: null })
  try {
    if (lockOwner === undefined) acquireLock({ root, session, token, pr: entry.number })
    if (git(facts.worktree, ['reset', '--hard', facts.mergeCommit]) === undefined) {
      throw new Error(`git reset --hard ${facts.mergeCommit} failed in ${facts.worktree}`)
    }
    const tree = gitOrThrow(git, facts.worktree, ['rev-parse', 'HEAD^{tree}'])
    if (tree !== entry.tree) {
      throw new Error(`the retargeted tree ${tree} differs from the reviewed tree ${entry.tree}`)
    }
    const dirty = gitOrThrow(git, facts.worktree, ['status', '--porcelain'])
    if (dirty !== '') throw new Error(`the plugin worktree ${facts.worktree} is not clean after the reset:\n${dirty}`)
    return updateLocalEntry(root, entry.number, { phase: 'retargeted', error: null })
  } catch (error) {
    recordFailure(root, entry.number, error)
    throw error
  }
}

/**
 * Verify and record the landed or pushed phase.
 * @param options - root, PR number, phase, session, token, apply and runners.
 * @returns the updated entry or a dry-run report.
 */
export function finishLocal({
  root,
  number,
  phase = 'pushed',
  session,
  token,
  apply = false,
  gh = ghText,
  git = gitText,
} = {}) {
  if (!FINISH_PHASES.includes(phase)) {
    throw new LocalLandUsageError(`--phase must be one of ${FINISH_PHASES.join(', ')}`)
  }
  const entry = requireLocalEntry(root, number)
  requireSession(entry, session)
  const lockOwner = requireLockOwner({ root, session, token })
  if (entry.phase === 'pushed') {
    if (phase !== 'pushed') {
      throw new Error(`PR #${entry.number} is already pushed; the phase cannot move back to ${phase}`)
    }
    if (lockOwner !== undefined) releaseLock({ root, session, token: lockOwner.token })
    return entry
  }
  if (!['published', 'merged', 'retargeted', 'landed', 'landed-offline', 'failed'].includes(entry.phase)) {
    throw new Error(`PR #${entry.number} is ${entry.phase}; land it before finish`)
  }
  const check = () => {
    const landed = readLandedManifest({ root, change: entry.change, tree: entry.tree })
    if (landed === undefined) {
      throw new Error(`no landed manifest for ${entry.change} with the reviewed tree; run openspec_apply_worktree action=land first`)
    }
    const main = gitOrThrow(git, root, ['rev-parse', 'main'])
    if (main !== landed.manifest.archiveCommit) {
      throw new Error(`local main ${main} is not the landed archive commit ${landed.manifest.archiveCommit}`)
    }
    const fetched = git(root, ['fetch', 'origin', 'main'], true) !== undefined
    const originMain = git(root, ['rev-parse', 'origin/main'])
    if (phase === 'pushed') {
      if (originMain !== main) {
        throw new Error(`local main ${main} is not pushed; run node scripts/push-landed.mjs --push before recording pushed`)
      }
    } else {
      if (originMain === main) {
        throw new Error('local main is already pushed; record --phase pushed')
      }
      if (originMain !== undefined && git(root, ['merge-base', '--is-ancestor', originMain, main], true) === undefined) {
        throw new Error('local main and origin/main have diverged; reconcile them before recording the offline land')
      }
      if (!fetched) return { landed, main, originMain: originMain ?? null, offline: true }
    }
    return { landed, main, originMain: originMain ?? null, offline: false }
  }
  let facts
  try {
    facts = check()
  } catch (error) {
    if (apply) recordFailure(root, entry.number, error)
    throw error
  }
  if (!apply) return { dryRun: true, entry, ...facts }
  const updated = updateLocalEntry(root, entry.number, {
    phase,
    error: null,
    ...(facts.offline ? { landedOfflineAt: new Date().toISOString() } : {}),
  })
  if (lockOwner !== undefined) releaseLock({ root, session, token: lockOwner.token })
  return updated
}

/**
 * Plan the recovery of a merged local pull request.
 * @param options - root, PR number and runners.
 * @returns the verification facts and the ordered recovery steps.
 */
export function recoverLocal({ root, number, gh = ghText, git = gitText } = {}) {
  const entry = requireLocalEntry(root, number)
  const facts = verifyLocal({ root, number: entry.number, gh, git })
  const changeLock = inspectChangeLock(root, facts.state)
  if (changeLock.state === 'alive') {
    throw new Error(`the plugin change lock is held by live process ${String(changeLock.owner.pid)}; wait for it to finish or recover it explicitly`)
  }
  const lock = readLockOwner(root)
  if (lock !== undefined && lock.ownerSession !== entry.ownerSession) {
    throw new Error(`the landing lock is held by session ${lock.ownerSession}, but the local entry belongs to ${entry.ownerSession}; run node scripts/pr-review-lock.mjs force-release --reason "<why>" and retry as ${entry.ownerSession}`)
  }
  const session = entry.ownerSession
  const tokenArg = lock === undefined ? '' : ` --token ${lock.token}`
  const steps = []
  if (changeLock.state === 'dead') {
    steps.push(`openspec_apply_worktree action=recover scope=change expectedOwner=${changeLock.owner.token}`)
  } else if (changeLock.state === 'corrupt') {
    steps.push('openspec_apply_worktree action=recover scope=change (inspect the corrupt change lock first)')
  }
  steps.push(`node scripts/pr-local-land.mjs retarget ${entry.number} --session ${session}${tokenArg} --apply`)
  steps.push(`openspec_apply_worktree action=land change=${entry.change} approvedBy=user (user approval)`)
  steps.push('node scripts/push-landed.mjs --push')
  steps.push(`node scripts/pr-local-land.mjs finish ${entry.number} --phase pushed --session ${session}${tokenArg} --apply`)
  return {
    number: entry.number,
    change: entry.change,
    phase: entry.phase,
    merged: true,
    treeMatches: true,
    mergeCommit: facts.mergeCommit,
    changeLock: { state: changeLock.state, owner: changeLock.owner ?? null },
    lock: lock === undefined ? null : { ownerSession: lock.ownerSession, pr: lock.pr },
    steps,
  }
}

/**
 * Read the local owner entries and their merge facts without writing.
 * @param options - root, optional PR number and runners.
 * @returns one report or a list.
 */
export function statusLocal({ root, number, gh = ghText, git = gitText } = {}) {
  const entries = Object.values(loadLocalState(root).prs)
    .filter((entry) => number === undefined || entry.number === Number(number))
    .sort((left, right) => left.number - right.number)
  if (entries.length === 0) {
    if (number === undefined) return { entries: [] }
    throw new Error(`PR #${number} has no local owner entry`)
  }
  const report = entries.map((entry) => {
    let pullRequest = null
    try {
      const pr = readPullRequest({ root, number: entry.number, gh })
      pullRequest = { state: pr.state, isDraft: pr.isDraft, mergeCommit: pr.mergeCommit ?? null }
    } catch {
      pullRequest = { state: 'unknown' }
    }
    let worktree = null
    let changeLock = { state: 'missing' }
    try {
      const state = requireWorktreeState(root, entry.change)
      worktree = state.worktree
      changeLock = inspectChangeLock(root, state)
    } catch {
      worktree = null
    }
    const landed = readLandedManifest({ root, change: entry.change, tree: entry.tree })
    return {
      number: entry.number,
      change: entry.change,
      phase: entry.phase,
      head: entry.head,
      tree: entry.tree,
      ownerSession: entry.ownerSession,
      pullRequest,
      worktree,
      changeLock: { state: changeLock.state },
      landed: landed === undefined ? null : { archiveCommit: landed.manifest.archiveCommit },
    }
  })
  return number === undefined ? { entries: report } : report[0]
}

/** Render usage. */
export function usage() {
  return [
    'usage: node scripts/pr-local-land.mjs <command>',
    '',
    'commands:',
    '  status [<n>]                        report local owner entries without writing',
    '  verify <n> [--session <id>]         verify the merge, tree, worktree and main',
    '  retarget <n> --session <id> [--token <t>] --apply  reset the worktree to the merge commit',
    '  finish <n> --session <id> [--token <t>] [--phase <phase>] --apply  record landed/landed-offline/pushed',
    '  recover <n>                         plan the recovery of a merged local PR',
    '',
    'The default is a dry run; only --apply writes phases and resets the worktree.',
  ].join('\n')
}

/** Parse one command line. */
export function parseArgs(argv) {
  const args = [...argv]
  const command = args.shift()
  if (command === undefined || command === '--help' || command === '-h') return { command: 'help' }
  if (!['status', 'verify', 'retarget', 'finish', 'recover'].includes(command)) {
    throw new LocalLandUsageError(`unknown command '${command}'`)
  }
  const options = { command, apply: false, json: false, phase: 'pushed', session: undefined, token: undefined, number: undefined }
  const positional = []
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index]
    if (value === '--apply') options.apply = true
    else if (value === '--json') options.json = true
    else if (['--session', '--token', '--phase'].includes(value)) {
      const next = args[index + 1]
      if (next === undefined || next === '' || next.startsWith('--')) {
        throw new LocalLandUsageError(`${value} needs a value`)
      }
      if (value === '--session') options.session = next
      else if (value === '--token') options.token = next
      else options.phase = next
      index += 1
    } else if (value.startsWith('--')) throw new LocalLandUsageError(`unknown argument '${value}'`)
    else positional.push(value)
  }
  if (command === 'status') {
    if (positional.length > 1) throw new LocalLandUsageError('status takes at most one PR number')
    if (options.apply) throw new LocalLandUsageError('status is read-only')
  } else if (command === 'recover') {
    if (positional.length !== 1) throw new LocalLandUsageError('recover needs one PR number')
    if (options.apply) throw new LocalLandUsageError('recover is read-only; it prints the recovery steps')
    options.number = Number(positional[0])
  } else {
    if (positional.length !== 1) throw new LocalLandUsageError(`${command} needs one PR number`)
    options.number = Number(positional[0])
    if (!Number.isInteger(options.number) || options.number < 1) {
      throw new LocalLandUsageError('the PR number must be a positive integer')
    }
    if (command === 'verify' && options.apply) throw new LocalLandUsageError('verify is read-only')
    if ((command === 'retarget' || command === 'finish') && options.session === undefined) {
      throw new LocalLandUsageError(`${command} needs --session <id>`)
    }
  }
  if (command === 'status' && positional.length === 1) {
    options.number = Number(positional[0])
    if (!Number.isInteger(options.number) || options.number < 1) {
      throw new LocalLandUsageError('the PR number must be a positive integer')
    }
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
    if (options.command === 'status') result = statusLocal({ root, number: options.number })
    else if (options.command === 'verify') {
      result = verifyLocal({ root, number: options.number, session: options.session })
    } else if (options.command === 'retarget') {
      result = retargetLocal({
        root,
        number: options.number,
        session: options.session,
        token: options.token,
        apply: options.apply,
      })
    } else if (options.command === 'finish') {
      result = finishLocal({
        root,
        number: options.number,
        phase: options.phase,
        session: options.session,
        token: options.token,
        apply: options.apply,
      })
    } else {
      result = recoverLocal({ root, number: options.number })
    }
    write(`${JSON.stringify(result, null, 2)}\n`)
    return 0
  } catch (error) {
    write(`${error instanceof Error ? error.message : String(error)}\n`)
    return error instanceof LocalLandUsageError ? 2 : 1
  }
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = main()
}
