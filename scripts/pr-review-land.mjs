#!/usr/bin/env node
/**
 * Land a reviewed pull request: rebase its head onto main, let the session
 * review the rebased branch, merge with `gh pr merge --rebase`, verify the
 * merged tree, and hand the archive/push phases back to the session.
 *
 * The script performs git and GitHub work only. It never calls the plugin
 * review or archive tools; the scheduled DSH session owns those calls.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

import {
  activeChangeNames,
  checksGreen,
  forgetPullRequest,
  hasTrustedMarker,
  loadState,
  mainWorktree,
  resolvePaths,
  UsageError,
  withRunLock,
} from './pr-review-watch.mjs'

/** Landing label required for authorization. */
export const LANDING_LABEL = 'mergeable'
/** Landing state file. */
export const LANDINGS_FILE = 'landings.json'
/** Landing manifest directory. */
export const MANIFEST_DIRECTORY = 'landings'
/** Local landing branch prefix. */
export const LANDING_BRANCH_PREFIX = 'pr-land/'
/** Phases that keep a landing open. */
const OPEN_PHASES = new Set(['prepared', 'reviewed', 'merged', 'archived', 'pushed'])
/** Terminal phases that may be retried or forgotten. */
const TERMINAL_PHASES = new Set(['pushed', 'failed', 'blocked', 'tree-mismatch'])

/** A usage error, mapped to exit code 2. */
export class LandUsageError extends UsageError {
  /** @param message - diagnostic. */
  constructor(message) {
    super(message)
    this.name = 'LandUsageError'
  }
}

/** Run a command and return its stdout, throwing on a non-zero exit. */
function capture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    const detail = String(result.stderr ?? '').trim() || String(result.stdout ?? '').trim()
    throw new Error(`${command} ${args.join(' ')} failed${detail === '' ? '' : `: ${detail}`}`)
  }
  return result.stdout
}

/** Git helper that trims stdout. */
function git(cwd, args) {
  return capture('git', ['-C', cwd, ...args]).trim()
}

/** Git helper that returns undefined instead of throwing. */
function gitMaybe(cwd, args) {
  const result = spawnSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.error || result.status !== 0) return undefined
  return result.stdout.trim()
}

/** Gh helper returning text; throws with stderr on failure. */
function gh(args, cwd) {
  return capture('gh', args, { cwd }).trim()
}

/** Read one JSON file, returning undefined when absent. */
function readJson(file) {
  if (!existsSync(file)) return undefined
  return JSON.parse(readFileSync(file, 'utf8'))
}

/** Write a JSON file atomically. */
function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true })
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`)
  renameSync(temporary, file)
}

/** Resolve landing paths under the watch cache. */
export function landPaths(root) {
  const paths = resolvePaths(root)
  return {
    ...paths,
    landings: join(paths.cache, LANDINGS_FILE),
    manifests: join(paths.cache, MANIFEST_DIRECTORY),
  }
}

/** Read the landing state. */
export function loadLandings(root) {
  const file = landPaths(root).landings
  const value = readJson(file)
  if (value === undefined) return { schemaVersion: 1, lands: {} }
  if (value === null || typeof value !== 'object' || Array.isArray(value) || typeof value.lands !== 'object' || value.lands === null) {
    throw new Error(`the landing state ${file} is not valid`)
  }
  return value
}

/** Save the landing state atomically. */
export function saveLandings(root, state) {
  writeJson(landPaths(root).landings, state)
}

/** Resolve one PR number and reject bad input. */
function requireNumber(number) {
  const n = Number(number)
  if (!Number.isInteger(n) || n < 1) throw new LandUsageError('the PR number must be a positive integer')
  return n
}

/** Read the current pull request through gh. */
export function readPullRequest({ root, number, gh: ghRunner = gh } = {}) {
  const n = requireNumber(number)
  const text = ghRunner([
    'pr', 'view', String(n), '--json',
    'number,state,isDraft,headRefOid,baseRefOid,baseRefName,statusCheckRollup,files,labels,mergeable,mergeStateStatus,comments',
  ], root)
  return JSON.parse(text)
}

/** Whether a label named mergeable is present. */
export function hasLandingLabel(pr) {
  return (Array.isArray(pr?.labels) ? pr.labels : [])
    .some((label) => String(label?.name ?? label) === LANDING_LABEL)
}

/** Read the authenticated gh login. */
function ghLogin(ghRunner, root) {
  return ghRunner(['api', 'user', '--jq', '.login'], root)
}

/** Whether a comment is a trusted pass for the PR head. */
export function trustedPass(comments, login, number, head) {
  const matching = (Array.isArray(comments) ? comments : []).filter((comment) => {
    if (comment?.author?.login !== login) return false
    return hasTrustedMarker([comment], login, number, head)
  })
  if (matching.length === 0) return false
  const latest = matching.at(-1)
  return /\*\*Verdict:\*\*\s*pass\b/iu.test(String(latest?.body ?? ''))
}

/** Verify the main worktree is clean and on main. */
function assertMainReady(root) {
  const branch = git(root, ['rev-parse', '--abbrev-ref', 'HEAD'])
  if (branch !== 'main') throw new Error(`landing must run from main, not ${branch}`)
  const status = git(root, ['status', '--porcelain'])
  if (status !== '') throw new Error(`landing needs a clean main worktree:\n${status}`)
}

/** Evaluate all landing gates. */
export function planLanding({ root = mainWorktree(), number, gh: ghRunner = gh } = {}) {
  const n = requireNumber(number)
  const pr = readPullRequest({ root, number: n, gh: ghRunner })
  const state = loadState(root)
  const entry = state.prs?.[String(n)]
  const change = activeChangeNames(pr.files)
  if (pr.state !== 'OPEN') throw new Error(`PR #${n} is ${String(pr.state).toLowerCase()}`)
  if (pr.isDraft === true) throw new Error(`PR #${n} is a draft`)
  if (String(pr.baseRefName ?? '') !== 'main') throw new Error(`PR #${n} targets ${String(pr.baseRefName)}, not main`)
  if (change.length !== 1) throw new Error(`PR #${n} must change exactly one active change; found ${change.join(', ') || 'none'}`)
  if (!hasLandingLabel(pr)) throw new Error(`PR #${n} has no ${LANDING_LABEL} label`)
  if (pr.mergeable !== 'MERGEABLE') throw new Error(`PR #${n} is not mergeable: ${String(pr.mergeable)}`)
  if (['DIRTY', 'CONFLICTING', 'BLOCKED'].includes(String(pr.mergeStateStatus))) {
    throw new Error(`PR #${n} merge state is ${String(pr.mergeStateStatus)}`)
  }
  if (!checksGreen(pr.statusCheckRollup)) throw new Error(`PR #${n} does not have a green CI rollup`)
  if (entry === undefined) throw new Error(`PR #${n} has no watch state; review it first`)
  if (entry.head !== pr.headRefOid) throw new Error(`PR #${n} head moved from ${entry.head} to ${pr.headRefOid}`)
  if (entry.status !== 'commented') throw new Error(`PR #${n} watch state is ${entry.status}, not commented`)
  const login = ghLogin(ghRunner, root)
  if (!trustedPass(pr.comments, login, n, pr.headRefOid)) {
    throw new Error(`PR #${n} has no trusted pass review for ${pr.headRefOid}`)
  }
  assertMainReady(root)
  return { number: n, change: change[0], head: pr.headRefOid, baseRefName: pr.baseRefName }
}

/** Reject a second unfinished landing. */
export function assertSingleLanding(lands, number) {
  const n = String(number)
  for (const [key, entry] of Object.entries(lands.lands ?? {})) {
    if (key === n) continue
    if (OPEN_PHASES.has(entry?.phase)) throw new Error(`PR #${key} is already landing in phase ${entry.phase}`)
  }
}

/** Prepare the local landing branch and state. */
export function prepareLanding({ root = mainWorktree(), number, gh: ghRunner = gh, apply = false } = {}) {
  const n = requireNumber(number)
  const plan = planLanding({ root, number: n, gh: ghRunner })
  if (!apply) return { dryRun: true, ...plan }
  const lands = loadLandings(root)
  assertSingleLanding(lands, n)
  const existing = lands.lands[String(n)]
  if (existing !== undefined && OPEN_PHASES.has(existing.phase)) return existing
  const paths = landPaths(root)
  const worktree = join(paths.worktrees, `pr-${n}`)
  git(root, ['fetch', 'origin', `+pull/${n}/head:refs/pr-review/pr-${n}`])
  git(root, ['fetch', 'origin', 'main'])
  const fetched = git(root, ['rev-parse', `refs/pr-review/pr-${n}`])
  if (fetched !== plan.head) throw new Error(`PR #${n} moved from ${plan.head} to ${fetched}; retry`)
  mkdirSync(paths.worktrees, { recursive: true })
  if (existsSync(worktree)) {
    if (gitMaybe(worktree, ['status', '--porcelain']) !== '') throw new Error(`the PR worktree ${worktree} is not clean`)
    git(worktree, ['switch', '--detach', plan.head])
  } else {
    git(root, ['worktree', 'add', '--detach', worktree, plan.head])
  }
  const branch = `${LANDING_BRANCH_PREFIX}${n}`
  git(worktree, ['switch', '-C', branch, plan.head])
  const preMergeMain = git(root, ['rev-parse', 'origin/main'])
  let phase = 'prepared'
  let error = null
  const ancestor = spawnSync('git', ['-C', worktree, 'merge-base', '--is-ancestor', 'origin/main', 'HEAD'], { encoding: 'utf8' })
  if (ancestor.status !== 0) {
    const rebase = spawnSync('git', ['-C', worktree, 'rebase', 'origin/main'], { encoding: 'utf8' })
    if (rebase.status !== 0) {
      spawnSync('git', ['-C', worktree, 'rebase', '--abort'], { encoding: 'utf8' })
      phase = 'blocked'
      error = `rebase conflict: ${String(rebase.stderr ?? '').trim() || 'git rebase failed'}`
    }
  }
  const landingHead = gitMaybe(worktree, ['rev-parse', 'HEAD'])
  if (landingHead === undefined) throw new Error(`PR #${n} landing branch has no head`)
  const entry = {
    number: n,
    change: plan.change,
    prHead: plan.head,
    preMergeMain,
    landingBranch: branch,
    worktree,
    landingHead,
    reviewedTree: null,
    mergedHead: null,
    archiveCommit: null,
    pushedHead: null,
    phase,
    error,
    attempts: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  lands.lands[String(n)] = entry
  saveLandings(root, lands)
  if (phase === 'blocked') throw new Error(error)
  return entry
}

/** Resolve the apply review record for one landing. */
function reviewRecordPath(root, entry) {
  const paths = landPaths(root)
  const directory = join(paths.commonDir, 'openspec-flow', 'review')
  let key = `local#${entry.change}`
  if (!existsSync(join(directory, key)) && existsSync(directory)) {
    const match = readdirSync(directory).find((name) => name.endsWith(`#${entry.change}`))
    if (match !== undefined) key = match
  }
  return join(directory, key, 'apply-review.json')
}

/** Verify the landing checkout and apply record still match the reviewed tree. */
function assertReviewRecord(root, entry, expectedTree = entry.reviewedTree) {
  if (gitMaybe(entry.worktree, ['status', '--porcelain']) !== '') {
    throw new Error(`the landing checkout ${entry.worktree} is not clean`)
  }
  const tree = git(entry.worktree, ['rev-parse', 'HEAD^{tree}'])
  if (expectedTree !== null && expectedTree !== undefined && tree !== expectedTree) {
    throw new Error(`the landing tree ${tree} does not match reviewed tree ${expectedTree}`)
  }
  const recordFile = reviewRecordPath(root, entry)
  const record = readJson(recordFile)
  if (record === undefined) throw new Error(`the apply review record ${recordFile} is missing`)
  if (record.state !== 'passed') throw new Error(`the apply review state is ${String(record.state)}, not passed`)
  if (record.treeSha !== tree) throw new Error(`the apply review tree ${String(record.treeSha)} does not match ${tree}`)
  return tree
}

/** Verify the reviewed tree and advance to reviewed. */
export function reviewedLanding({ root = mainWorktree(), number, apply = false } = {}) {
  const n = requireNumber(number)
  const lands = loadLandings(root)
  const entry = lands.lands[String(n)]
  if (entry === undefined) throw new Error(`PR #${n} has no landing state; run prepare first`)
  if (entry.phase === 'reviewed' || entry.phase === 'merged') return entry
  if (entry.phase !== 'prepared') throw new Error(`PR #${n} landing phase is ${entry.phase}, not prepared`)
  if (!apply) return { dryRun: true, entry }
  const head = git(entry.worktree, ['rev-parse', 'HEAD'])
  if (head !== entry.landingHead) throw new Error(`the landing head moved from ${entry.landingHead} to ${head}`)
  const tree = assertReviewRecord(root, entry)
  entry.reviewedTree = tree
  entry.phase = 'reviewed'
  entry.error = null
  entry.updatedAt = new Date().toISOString()
  saveLandings(root, lands)
  return entry
}

/** Merge the reviewed pull request with gh rebase. */
export function mergeLanding({ root = mainWorktree(), number, gh: ghRunner = gh, apply = false } = {}) {
  const n = requireNumber(number)
  const lands = loadLandings(root)
  const entry = lands.lands[String(n)]
  if (entry === undefined) throw new Error(`PR #${n} has no landing state`)
  if (entry.phase === 'merged' || entry.phase === 'archived' || entry.phase === 'pushed') return entry
  if (entry.phase !== 'reviewed') throw new Error(`PR #${n} landing phase is ${entry.phase}, not reviewed`)
  if (!apply) return { dryRun: true, entry }
  assertReviewRecord(root, entry)
  const plan = planLanding({ root, number: n, gh: ghRunner })
  if (plan.change !== entry.change) throw new Error(`PR #${n} change changed from ${entry.change} to ${plan.change}`)
  const originMain = git(root, ['rev-parse', 'origin/main'])
  if (originMain !== entry.preMergeMain) {
    entry.phase = 'failed'
    entry.error = 'origin/main moved; prepare and review again'
    saveLandings(root, lands)
    throw new Error(entry.error)
  }
  try {
    ghRunner(['pr', 'merge', String(n), '--rebase'], root)
  } catch (error) {
    entry.phase = 'failed'
    entry.error = `gh pr merge failed: ${error instanceof Error ? error.message : String(error)}`
    saveLandings(root, lands)
    throw new Error(entry.error)
  }
  git(root, ['fetch', 'origin', 'main'])
  try {
    git(root, ['merge', '--ff-only', 'origin/main'])
  } catch (error) {
    entry.phase = 'failed'
    entry.error = `main fast-forward failed: ${error instanceof Error ? error.message : String(error)}`
    saveLandings(root, lands)
    throw new Error(entry.error)
  }
  const mergedHead = git(root, ['rev-parse', 'HEAD'])
  const mergedTree = git(root, ['rev-parse', 'HEAD^{tree}'])
  entry.mergedHead = mergedHead
  entry.phase = 'merged'
  entry.error = null
  entry.updatedAt = new Date().toISOString()
  if (mergedTree !== entry.reviewedTree) {
    entry.phase = 'tree-mismatch'
    entry.error = `merged tree ${mergedTree} differs from reviewed tree ${entry.reviewedTree}`
  }
  saveLandings(root, lands)
  if (entry.phase === 'tree-mismatch') throw new Error(entry.error)
  return entry
}

/** Record the archive commit after the session archived on main. */
export function archiveLanding({ root = mainWorktree(), number, commit, apply = false } = {}) {
  const n = requireNumber(number)
  const lands = loadLandings(root)
  const entry = lands.lands[String(n)]
  if (entry === undefined) throw new Error(`PR #${n} has no landing state`)
  if (entry.phase === 'archived' || entry.phase === 'pushed') return entry
  if (entry.phase !== 'merged') throw new Error(`PR #${n} landing phase is ${entry.phase}, not merged`)
  if (!apply) return { dryRun: true, entry }
  if (existsSync(join(root, 'openspec', 'changes', entry.change))) {
    throw new Error(`the change ${entry.change} is still active; archive it first`)
  }
  const archived = readdirSync(join(root, 'openspec', 'changes', 'archive')).some((name) => name.endsWith(`-${entry.change}`))
  if (!archived) throw new Error(`the change ${entry.change} has no archive directory`)
  const head = commit ?? git(root, ['rev-parse', 'HEAD'])
  if (head !== git(root, ['rev-parse', 'HEAD'])) throw new Error(`the archive commit ${head} is not HEAD`)
  if (git(root, ['status', '--porcelain']) !== '') throw new Error('landing needs a clean main worktree before archive')
  entry.archiveCommit = head
  entry.phase = 'archived'
  entry.error = null
  entry.updatedAt = new Date().toISOString()
  saveLandings(root, lands)
  return entry
}

/** Record the pushed head after the session pushes main. */
export function pushLanding({ root = mainWorktree(), number, apply = false } = {}) {
  const n = requireNumber(number)
  const lands = loadLandings(root)
  const entry = lands.lands[String(n)]
  if (entry === undefined) throw new Error(`PR #${n} has no landing state`)
  if (entry.phase === 'pushed') return entry
  if (entry.phase !== 'archived') throw new Error(`PR #${n} landing phase is ${entry.phase}, not archived`)
  if (!apply) return { dryRun: true, entry }
  git(root, ['fetch', 'origin', 'main'])
  const head = git(root, ['rev-parse', 'HEAD'])
  const origin = git(root, ['rev-parse', 'origin/main'])
  if (head !== origin) throw new Error(`main ${head} is not pushed; origin/main is ${origin}`)
  entry.pushedHead = head
  entry.phase = 'pushed'
  entry.error = null
  entry.updatedAt = new Date().toISOString()
  saveLandings(root, lands)
  return entry
}

/** Finish a pushed landing and clean its checkout. */
export function finishLanding({ root = mainWorktree(), number, apply = false } = {}) {
  const n = requireNumber(number)
  const lands = loadLandings(root)
  const entry = lands.lands[String(n)]
  if (entry === undefined) throw new Error(`PR #${n} has no landing state`)
  if (entry.phase !== 'pushed') throw new Error(`PR #${n} landing phase is ${entry.phase}, not pushed`)
  if (!apply) return { dryRun: true, entry }
  if (entry.pushedHead !== git(root, ['rev-parse', 'HEAD'])) throw new Error('the pushed head does not match HEAD')
  if (existsSync(join(root, 'openspec', 'changes', entry.change))) throw new Error(`the change ${entry.change} is still active`)
  const manifest = {
    number: n,
    change: entry.change,
    prHead: entry.prHead,
    preMergeMain: entry.preMergeMain,
    landingHead: entry.landingHead,
    reviewedTree: entry.reviewedTree,
    mergedHead: entry.mergedHead,
    archiveCommit: entry.archiveCommit,
    pushedHead: entry.pushedHead,
    finishedAt: new Date().toISOString(),
  }
  writeJson(join(landPaths(root).manifests, `pr-${n}-${entry.mergedHead}.json`), manifest)
  if (existsSync(entry.worktree)) git(root, ['worktree', 'remove', '--force', entry.worktree])
  spawnSync('git', ['-C', root, 'branch', '-D', entry.landingBranch], { encoding: 'utf8' })
  forgetPullRequest({ root, number: n, change: entry.change, worktree: entry.worktree })
  delete lands.lands[String(n)]
  saveLandings(root, lands)
  return manifest
}

/** Read or forget landing state. */
export function stateLanding({ root = mainWorktree(), number, forget = false, apply = false } = {}) {
  const lands = loadLandings(root)
  if (!forget) return lands
  const n = requireNumber(number)
  const entry = lands.lands[String(n)]
  if (entry === undefined) throw new Error(`PR #${n} has no landing state`)
  if (!apply) return { dryRun: true, entry }
  if (!TERMINAL_PHASES.has(entry.phase)) throw new Error(`PR #${n} is still ${entry.phase}; finish or fail it first`)
  if (existsSync(entry.worktree)) spawnSync('git', ['-C', root, 'worktree', 'remove', '--force', entry.worktree], { encoding: 'utf8' })
  spawnSync('git', ['-C', root, 'branch', '-D', entry.landingBranch], { encoding: 'utf8' })
  delete lands.lands[String(n)]
  saveLandings(root, lands)
  return { forgotten: n }
}

/** Render usage. */
export function usage() {
  return [
    'usage: node scripts/pr-review-land.mjs <command> <pr> [options]',
    '',
    'commands:',
    '  plan <n> [--json]                     check landing gates without writing',
    '  prepare <n> [--json] --apply          create the rebased landing branch',
    '  reviewed <n> [--json] --apply         record the passed review tree',
    '  merge <n> [--json] --apply            merge with gh pr merge --rebase',
    '  archive <n> [--commit <sha>] --apply  record the archive commit',
    '  push <n> [--json] --apply             record the pushed main head',
    '  finish <n> [--json] --apply           write the manifest and clean up',
    '  state [--json] [--forget <n>] --apply',
    '',
    'The landing command never pushes, archives or merges without --apply.',
  ].join('\n')
}

/** Parse a landing command line. */
export function parseArgs(argv) {
  const args = [...argv]
  const command = args.shift()
  if (command === undefined || command === '--help' || command === '-h') return { command: 'help' }
  if (!['plan', 'prepare', 'reviewed', 'merge', 'archive', 'push', 'finish', 'state'].includes(command)) {
    throw new LandUsageError(`unknown command '${command}'`)
  }
  const options = { command, json: false, apply: false, commit: undefined, forget: undefined }
  const positional = []
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index]
    if (value === '--json') options.json = true
    else if (value === '--apply') options.apply = true
    else if (value === '--commit' || value === '--forget') {
      const next = args[index + 1]
      if (next === undefined || next === '' || next.startsWith('--')) throw new LandUsageError(`${value} needs a value`)
      if (value === '--commit') options.commit = next
      else options.forget = next
      index += 1
    } else if (value.startsWith('--')) throw new LandUsageError(`unknown argument '${value}'`)
    else positional.push(value)
  }
  if (command === 'state') {
    if (positional.length > 0) throw new LandUsageError('state takes no positional argument')
    return options
  }
  if (positional.length !== 1) throw new LandUsageError(`${command} needs one PR number`)
  options.number = requireNumber(positional[0])
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
    if (options.command === 'state') {
      const result = stateLanding({
        root,
        number: options.forget,
        forget: options.forget !== undefined,
        apply: options.apply,
      })
      write(`${JSON.stringify(result, null, 2)}\n`)
      return 0
    }
    const result = withRunLock(root, () => {
      if (options.command === 'plan') return planLanding({ root, number: options.number })
      if (options.command === 'prepare') return prepareLanding({ root, number: options.number, apply: options.apply })
      if (options.command === 'reviewed') return reviewedLanding({ root, number: options.number, apply: options.apply })
      if (options.command === 'merge') return mergeLanding({ root, number: options.number, apply: options.apply })
      if (options.command === 'archive') {
        return archiveLanding({ root, number: options.number, commit: options.commit, apply: options.apply })
      }
      if (options.command === 'push') return pushLanding({ root, number: options.number, apply: options.apply })
      return finishLanding({ root, number: options.number, apply: options.apply })
    })
    write(options.json ? `${JSON.stringify(result, null, 2)}\n` : `${JSON.stringify(result, null, 2)}\n`)
    return 0
  } catch (error) {
    write(`${error instanceof Error ? error.message : String(error)}\n`)
    return error instanceof LandUsageError ? 2 : 1
  }
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = main()
}
