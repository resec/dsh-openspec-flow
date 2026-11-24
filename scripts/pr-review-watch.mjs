#!/usr/bin/env node
/**
 * Poll open pull requests, prepare a detached PR worktree, render the apply-review
 * report and publish it as a comment.
 *
 * The script never calls the plugin review tools and never executes PR code. A
 * DSH session runs `openspec_review`; this command supplies the deterministic
 * GitHub/git work around it.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

/** Cache directory under the main worktree. */
export const CACHE_DIRECTORY = join('.cache', 'pr-review')
/** State file name. */
export const STATE_FILE = 'state.json'
/** Run lock directory name. */
export const RUN_LOCK = 'run.lock'
/** Worktree directory name. */
export const WORKTREE_DIRECTORY = 'worktrees'
/** Report directory name. */
export const REPORT_DIRECTORY = 'reports'
/** Local owner state file name. */
export const LOCAL_STATE_FILE = 'local-prs.json'
/** Local owner phases. */
export const LOCAL_PHASES = ['published', 'merged', 'retargeted', 'landed', 'pushed', 'landed-offline', 'failed']
/** Cross-session landing lock directory name. */
export const LANDING_LOCK_DIRECTORY = 'landing.lock'
/** Age after which a landing lock is reported stale. */
export const LANDING_LOCK_TTL_MINUTES = 120
/** The offline route when GitHub or the origin remote is unreachable. */
export const OFFLINE_LAND_COMMAND = 'run npm run test:lab -- --mock-only, then openspec_apply_worktree action=land with approvedBy "user", archive and stop at local main without a push; run node scripts/push-landed.mjs --push when GitHub returns'
/** Marker pattern for a trusted report comment. */
const MARKER_PATTERN = /<!-- pr-review: pr=(\d+) head=([0-9a-f]{7,40}) round=(\d+) -->/u
/** Active change path pattern. */
const ACTIVE_CHANGE_PATTERN = /^openspec\/changes\/([^/]+)\//u

/** A usage error, mapped to exit code 2. */
export class UsageError extends Error {
  /** @param message - diagnostic. */
  constructor(message) {
    super(message)
    this.name = 'UsageError'
  }
}

/** Run a command and return stdout, throwing on a non-zero exit. */
function capture(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.error) throw result.error
  if (result.status !== 0 && options.allowFailure !== true) {
    const detail = String(result.stderr ?? '').trim() || String(result.stdout ?? '').trim()
    throw new Error(`${command} ${args.join(' ')} failed${detail === '' ? '' : `: ${detail}`}`)
  }
  return result
}

/** Git text helper. */
function gitText(cwd, args, allowFailure = false) {
  const result = capture('git', ['-C', cwd, ...args], { allowFailure })
  if (result.status !== 0) return undefined
  return result.stdout.trim()
}

/** Gh text helper; a missing gh binary is reported as unreachable. */
function ghText(args, options = {}) {
  let result
  try {
    result = capture('gh', args, { cwd: options.cwd, allowFailure: options.allowFailure })
  } catch (error) {
    if (error?.code === 'ENOENT') return undefined
    throw error
  }
  if (result.status !== 0) return undefined
  return result.stdout.trim()
}

/**
 * Resolve the main worktree of the repository.
 * @param cwd - any directory in a checkout.
 * @returns absolute main worktree root.
 */
export function mainWorktree(cwd = process.cwd()) {
  const text = gitText(cwd, ['worktree', 'list', '--porcelain'])
  if (text === undefined) throw new Error(`cannot resolve the main worktree from ${cwd}`)
  const line = text.split('\n').find((entry) => entry.startsWith('worktree '))
  if (line === undefined) throw new Error(`git worktree list named no worktree for ${cwd}`)
  return line.slice('worktree '.length)
}

/**
 * Resolve the cache paths for a repository.
 * @param root - main worktree.
 * @returns paths.
 */
export function resolvePaths(root) {
  const cache = join(root, CACHE_DIRECTORY)
  return {
    root,
    cache,
    state: join(cache, STATE_FILE),
    lock: join(cache, RUN_LOCK),
    worktrees: join(cache, WORKTREE_DIRECTORY),
    reports: join(cache, REPORT_DIRECTORY),
    localState: join(cache, LOCAL_STATE_FILE),
    landingLock: join(cache, LANDING_LOCK_DIRECTORY),
    commonDir: gitText(root, ['rev-parse', '--path-format=absolute', '--git-common-dir']),
  }
}

/** Read a JSON file, returning undefined when absent. */
function readJson(file) {
  if (!existsSync(file)) return undefined
  return JSON.parse(readFileSync(file, 'utf8'))
}

/** Write a JSON file atomically. */
export function writeJsonAtomic(file, value) {
  mkdirSync(dirname(file), { recursive: true })
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`)
  renameSync(temporary, file)
}

/**
 * Read the watch state.
 * @param root - main worktree.
 * @returns state object.
 */
export function loadState(root) {
  const paths = resolvePaths(root)
  let value
  try {
    value = readJson(paths.state)
  } catch (error) {
    throw new Error(`the PR review state at ${paths.state} is corrupt: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (value === undefined) return { schemaVersion: 1, prs: {} }
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || value.schemaVersion !== 1 || value.prs === null || typeof value.prs !== 'object' || Array.isArray(value.prs)) {
    throw new Error(`the PR review state at ${paths.state} is corrupt`)
  }
  return value
}

/**
 * Save the watch state atomically.
 * @param root - main worktree.
 * @param state - state object.
 */
export function saveState(root, state) {
  writeJsonAtomic(resolvePaths(root).state, state)
}

/**
 * Read the local owner state.
 * @param root - main worktree.
 * @returns state object.
 */
export function loadLocalState(root) {
  const paths = resolvePaths(root)
  let value
  try {
    value = readJson(paths.localState)
  } catch (error) {
    throw new Error(`the local PR state at ${paths.localState} is corrupt: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (value === undefined) return { schemaVersion: 1, prs: {} }
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || value.schemaVersion !== 1 || value.prs === null || typeof value.prs !== 'object' || Array.isArray(value.prs)) {
    throw new Error(`the local PR state at ${paths.localState} is corrupt`)
  }
  for (const [key, entry] of Object.entries(value.prs)) {
    validateLocalEntry(entry, key, paths.localState)
  }
  return value
}

/** Validate one local owner entry. */
function validateLocalEntry(entry, key, file) {
  if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error(`the local PR state at ${file} has an invalid entry ${key}`)
  }
  for (const field of ['change', 'branch', 'head', 'tree', 'record', 'ownerSession', 'phase']) {
    if (typeof entry[field] !== 'string' || entry[field].trim() === '') {
      throw new Error(`the local PR state at ${file} has an invalid ${field} for ${key}`)
    }
  }
  if (!LOCAL_PHASES.includes(entry.phase)) {
    throw new Error(`the local PR state at ${file} has an invalid phase for ${key}`)
  }
  if (!Number.isInteger(entry.number) || entry.number < 1) {
    throw new Error(`the local PR state at ${file} has an invalid number for ${key}`)
  }
  if (entry.publishedAt !== undefined && typeof entry.publishedAt !== 'string') {
    throw new Error(`the local PR state at ${file} has an invalid publishedAt for ${key}`)
  }
  if (entry.updatedAt !== undefined && typeof entry.updatedAt !== 'string') {
    throw new Error(`the local PR state at ${file} has an invalid updatedAt for ${key}`)
  }
}

/** Save the local owner state. */
export function saveLocalState(root, state) {
  writeJsonAtomic(resolvePaths(root).localState, state)
}

/** Return the local owner PR numbers. */
export function localPullRequestNumbers(root) {
  return new Set(Object.keys(loadLocalState(root).prs))
}

/**
 * Find the local owner entry for a change and branch.
 * @param root - main worktree.
 * @param options - change and optional branch.
 * @returns the matching entry, or undefined.
 */
export function findLocalEntry(root, { change, branch } = {}) {
  if (typeof change !== 'string' || change === '') return undefined
  for (const entry of Object.values(loadLocalState(root).prs)) {
    if (entry.change !== change) continue
    if (branch !== undefined && entry.branch !== branch) continue
    return entry
  }
  return undefined
}

/** Update one local owner entry. */
export function updateLocalEntry(root, number, patch) {
  const state = loadLocalState(root)
  const entry = state.prs[String(number)]
  if (entry === undefined) throw new Error(`PR #${number} has no local owner entry`)
  state.prs[String(number)] = { ...entry, ...patch, updatedAt: new Date().toISOString() }
  saveLocalState(root, state)
  return state.prs[String(number)]
}

/** Delete one local owner entry. */
export function deleteLocalEntry(root, number) {
  const state = loadLocalState(root)
  const entry = state.prs[String(number)]
  if (entry === undefined) return undefined
  delete state.prs[String(number)]
  saveLocalState(root, state)
  return entry
}

/**
 * Remove closed or completed local owner entries, retaining unfinished ones.
 * @param options - root and gh runner.
 * @returns removed and retained entries.
 */
export function cleanupLocalEntries({ root = process.cwd(), gh = ghText } = {}) {
  const state = loadLocalState(root)
  const removed = []
  const retained = []
  for (const [key, entry] of Object.entries(state.prs)) {
    const text = gh(['pr', 'view', key, '--json', 'state'])
    if (text === undefined) throw new Error(`gh pr view ${key} failed`)
    const pr = JSON.parse(text)
    const landed = entry.phase === 'landed' || entry.phase === 'landed-offline'
    const remove = entry.phase === 'pushed'
      || (pr.state === 'CLOSED' && !landed)
    if (remove) {
      delete state.prs[key]
      removed.push({ number: entry.number, change: entry.change, local: true, removed: true })
    } else if (pr.state !== 'OPEN') {
      retained.push({ number: entry.number, change: entry.change, phase: entry.phase, state: pr.state })
    }
  }
  saveLocalState(root, state)
  return { removed, retained }
}

/** Read the landing-lock owner without importing the lock CLI. */
export function readLandingLock(root = process.cwd(), now = Date.now()) {
  const file = join(resolvePaths(root).landingLock, 'owner.json')
  let value
  try {
    value = readJson(file)
  } catch (error) {
    throw new Error(`the landing lock at ${file} is corrupt: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (value === undefined) return { held: false }
  if (value === null || typeof value !== 'object' || Array.isArray(value)
    || typeof value.ownerSession !== 'string' || typeof value.token !== 'string'
    || !Number.isInteger(value.pr) || typeof value.at !== 'string' || Number.isNaN(Date.parse(value.at))) {
    throw new Error(`the landing lock at ${file} is corrupt`)
  }
  const ageMinutes = Math.max(0, Math.floor((now - Date.parse(value.at)) / 60000))
  return {
    held: true,
    ownerSession: value.ownerSession,
    token: value.token,
    pr: value.pr,
    at: value.at,
    ageMinutes,
    stale: !Number.isFinite(ageMinutes) || ageMinutes > LANDING_LOCK_TTL_MINUTES,
  }
}

/** List open landing phases from the landing state. */
function openLandings(root) {
  const file = join(resolvePaths(root).cache, 'landings.json')
  let value
  try {
    value = readJson(file)
  } catch {
    return []
  }
  if (value === null || typeof value !== 'object' || value.lands === null || typeof value.lands !== 'object') return []
  const open = new Set(['prepared', 'review-failed', 'reviewed', 'archive-pending', 'archive-failed', 'archived', 'push-pending'])
  return Object.entries(value.lands)
    .filter(([, entry]) => open.has(entry?.phase))
    .map(([number, entry]) => ({ number: Number(number), phase: entry.phase, mode: entry.mode ?? null }))
}

/**
 * Read-only environment preflight.
 * @param options - root, gh and git runners.
 * @returns online, local-main, landing and lock facts.
 */
export function preflight({ root = mainWorktree(), gh = ghText, git = gitText } = {}) {
  const paths = resolvePaths(root)
  const repo = gh(['repo', 'view', '--json', 'nameWithOwner'])
  const online = repo !== undefined
  const fetched = online && git(root, ['fetch', 'origin', 'main'], true) !== undefined
  const originMain = git(root, ['rev-parse', 'origin/main'])
  const main = git(root, ['rev-parse', 'main'])
  const ahead = originMain === undefined || main === undefined
    ? null
    : Number(git(root, ['rev-list', '--count', 'origin/main..main']) ?? '0')
  const behind = originMain === undefined || main === undefined
    ? null
    : Number(git(root, ['rev-list', '--count', 'main..origin/main']) ?? '0')
  const lock = readLandingLock(root)
  const landings = openLandings(root)
  let reason = null
  if (!online) reason = 'github-unreachable'
  else if (!fetched || originMain === undefined) reason = 'origin-unreachable'
  else if (ahead !== 0) reason = 'local-main-ahead'
  else if (lock.held && !lock.stale) reason = 'landing-lock-held'
  const offlineLand = !online || !fetched || originMain === undefined
  return {
    root,
    online,
    reason,
    offlineLand,
    command: offlineLand ? OFFLINE_LAND_COMMAND : null,
    localMain: { main: main ?? null, originMain: originMain ?? null, ahead, behind },
    lock,
    landings,
    paths: { localState: paths.localState, landingLock: paths.landingLock },
  }
}

/**
 * Run one command under the exclusive run lock.
 * @param root - main worktree.
 * @param work - callback.
 * @returns callback result.
 */
export function withRunLock(root, work) {
  const { lock } = resolvePaths(root)
  mkdirSync(dirname(lock), { recursive: true })
  try {
    mkdirSync(lock)
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw new Error(`another PR review run holds ${lock}; inspect the owner and remove the stale lock`)
    }
    throw error
  }
  try {
    writeJsonAtomic(join(lock, 'owner.json'), { pid: process.pid, at: new Date().toISOString() })
    return work()
  } finally {
    rmSync(lock, { recursive: true, force: true })
  }
}

/**
 * Extract the active change names from a PR file list.
 * @param files - `[{ path }]`.
 * @returns distinct active change names.
 */
export function activeChangeNames(files) {
  const names = new Set()
  for (const file of Array.isArray(files) ? files : []) {
    const match = ACTIVE_CHANGE_PATTERN.exec(String(file?.path ?? ''))
    if (match !== null && match[1] !== 'archive') names.add(match[1])
  }
  return [...names]
}

/** The timestamp GitHub reports for a check run that has not started. */
const ZERO_TIMESTAMP = '0001-01-01T00:00:00Z'

/**
 * The identity a check entry is grouped by.
 * @param entry - one `statusCheckRollup` entry.
 * @returns the workflow and check key, or the status context key.
 */
function checkIdentity(entry) {
  const workflow = typeof entry?.workflowName === 'string' ? entry.workflowName : ''
  const name = typeof entry?.name === 'string'
    ? entry.name
    : typeof entry?.context === 'string'
      ? entry.context
      : ''
  return `${workflow}\u0000${name}`
}

/**
 * A check entry's usable start time: its `startedAt`, or a status context's `createdAt`.
 * @param entry - one `statusCheckRollup` entry.
 * @returns milliseconds since the epoch, or NaN when the entry has no usable start time.
 */
function checkStartedAt(entry) {
  const value = typeof entry?.startedAt === 'string' && entry.startedAt !== ''
    ? entry.startedAt
    : typeof entry?.createdAt === 'string'
      ? entry.createdAt
      : ''
  if (value === '' || value === ZERO_TIMESTAMP) return NaN
  const time = Date.parse(value)
  return Number.isFinite(time) && time > 0 ? time : NaN
}

/**
 * Whether one check entry succeeded.
 * @param entry - one `statusCheckRollup` entry.
 * @returns whether the entry's conclusion or state is successful.
 */
function checkSucceeded(entry) {
  return entry?.conclusion === 'SUCCESS' || entry?.state === 'SUCCESS'
}

/**
 * Whether every check's newest entry is successful and at least one check exists.
 *
 * Checks are grouped by workflow and name, or by status context. When every
 * entry of a group has a usable start time (a check run's `startedAt` or a
 * status context's `createdAt`), only the entries at the latest start time
 * decide the group; earlier entries are superseded. A group with any entry
 * without a usable start time requires every entry in it to succeed.
 *
 * @param rollup - `statusCheckRollup`.
 * @returns true only for a non-empty rollup with every newest check entry successful.
 */
export function checksGreen(rollup) {
  if (!Array.isArray(rollup) || rollup.length === 0) return false
  const groups = new Map()
  for (const entry of Array.isArray(rollup) ? rollup : []) {
    const key = checkIdentity(entry)
    const group = groups.get(key)
    if (group === undefined) groups.set(key, [entry])
    else group.push(entry)
  }
  for (const group of groups.values()) {
    const times = group.map(checkStartedAt)
    if (times.some((time) => Number.isNaN(time))) {
      if (!group.every(checkSucceeded)) return false
      continue
    }
    const latest = Math.max(...times)
    const newest = group.filter((entry, index) => times[index] === latest)
    if (!newest.every(checkSucceeded)) return false
  }
  return true
}

/**
 * Filter open PRs to review candidates.
 * @param prs - `gh pr list` result.
 * @param state - current state.
 * @returns candidate records.
 */
export function filterCandidates(prs, state, localNumbers = new Set()) {
  const candidates = []
  for (const pr of Array.isArray(prs) ? prs : []) {
    if (pr?.isDraft === true) continue
    if (!checksGreen(pr?.statusCheckRollup)) continue
    const changes = activeChangeNames(pr?.files)
    if (changes.length !== 1) continue
    const number = Number(pr.number)
    if (!Number.isInteger(number) || number < 1) continue
    if (localNumbers.has(String(number))) continue
    const head = String(pr.headRefOid ?? '')
    if (head === '') continue
    const recorded = state?.prs?.[String(number)]
    if (recorded !== undefined && recorded.head === head) {
      if (recorded.status === 'commented') continue
      candidates.push({
        number,
        head,
        baseRefOid: String(pr.baseRefOid ?? ''),
        baseRefName: String(pr.baseRefName ?? ''),
        change: recorded.change ?? changes[0],
        worktree: recorded.worktree ?? null,
        status: recorded.status,
        resume: true,
      })
      continue
    }
    candidates.push({
      number,
      head,
      baseRefOid: String(pr.baseRefOid ?? ''),
      baseRefName: String(pr.baseRefName ?? ''),
      change: changes[0],
      worktree: null,
      status: 'new',
      resume: false,
    })
  }
  return candidates
}

/**
 * List review candidates from open PRs and report owner-managed local PRs.
 * @param options - root, gh runner and state.
 * @returns `{ candidates, ownerManaged }`, where ownerManaged lists the open
 *          pull-request numbers recorded as local owner entries.
 */
export function pollPullRequests({ root = process.cwd(), gh = ghText, state = loadState(root), local = localPullRequestNumbers(root) } = {}) {
  const text = gh([
    'pr', 'list', '--state', 'open', '--limit', '100', '--json',
    'number,headRefOid,baseRefOid,baseRefName,isDraft,statusCheckRollup,files,updatedAt',
  ])
  if (text === undefined) throw new Error('gh pr list failed')
  const prs = JSON.parse(text)
  const candidates = filterCandidates(prs, state, local)
  const ownerManaged = [...new Set((Array.isArray(prs) ? prs : [])
    .map((pr) => Number(pr?.number))
    .filter((number) => Number.isInteger(number) && number > 0 && local.has(String(number))))]
    .sort((left, right) => left - right)
  return { candidates, ownerManaged }
}

/**
 * Render the poll result for the command line.
 * @param result - `{ candidates, ownerManaged }`.
 * @returns one line per local and candidate pull request.
 */
export function pollText({ candidates, ownerManaged }) {
  const lines = (Array.isArray(ownerManaged) ? ownerManaged : [])
    .map((number) => `PR #${number} owner-managed (skipped)`)
  const list = Array.isArray(candidates) ? candidates : []
  lines.push(...list.map((candidate) => (
    `PR #${candidate.number} ${candidate.head.slice(0, 12)} ${candidate.change}${candidate.resume ? ' (resume)' : ''}`
  )))
  if (lines.length === 0) return 'no review candidates\n'
  return `${lines.join('\n')}\n`
}

/** Run the gh JSON helper and parse the result. */
function ghJson(gh, args) {
  const text = gh(args)
  if (text === undefined) throw new Error(`gh ${args.join(' ')} failed`)
  return JSON.parse(text)
}

/**
 * Fetch a PR head and base, compute the merge base and prepare its worktree.
 * @param options - root, PR number, gh runner and git runner.
 * @returns prepared facts.
 */
export function preparePullRequest({ root = process.cwd(), number, gh = ghText, git = gitText } = {}) {
  if (!Number.isInteger(Number(number)) || Number(number) < 1) throw new UsageError('prepare needs a positive PR number')
  const n = Number(number)
  if (localPullRequestNumbers(root).has(String(n))) {
    throw new Error(`PR #${n} is owner-managed locally; use pr-local-land, not the review watch`)
  }
  const pr = ghJson(gh, [
    'pr', 'view', String(n), '--json',
    'number,state,isDraft,headRefOid,baseRefOid,baseRefName,statusCheckRollup,files',
  ])
  if (pr.state !== 'OPEN') throw new Error(`PR #${n} is ${String(pr.state).toLowerCase()}`)
  if (pr.isDraft === true) throw new Error(`PR #${n} is a draft`)
  if (!checksGreen(pr.statusCheckRollup)) throw new Error(`PR #${n} does not have a green CI rollup`)
  const changes = activeChangeNames(pr.files)
  if (changes.length !== 1) throw new Error(`PR #${n} must change exactly one active change; found ${changes.join(', ') || 'none'}`)
  const change = changes[0]
  const head = String(pr.headRefOid)
  const baseRefName = String(pr.baseRefName)
  if (head === '' || baseRefName === '') throw new Error(`PR #${n} has no head or base ref`)

  const paths = resolvePaths(root)
  if (paths.commonDir === undefined) throw new Error(`${root} is not a git repository`)
  git(root, ['fetch', 'origin', `+pull/${n}/head:refs/pr-review/pr-${n}`])
  git(root, ['fetch', 'origin', `+refs/heads/${baseRefName}:refs/pr-review/base-${n}`])
  const fetchedHead = git(root, ['rev-parse', `refs/pr-review/pr-${n}`])
  const baseTip = git(root, ['rev-parse', `refs/pr-review/base-${n}`])
  const mergeBase = git(root, ['merge-base', baseTip, fetchedHead])
  if (fetchedHead !== head) throw new Error(`PR #${n} moved from ${head} to ${fetchedHead}; retry on the next poll`)
  if (mergeBase === undefined) throw new Error(`PR #${n} has no merge base`)

  const worktree = join(paths.worktrees, `pr-${n}`)
  mkdirSync(paths.worktrees, { recursive: true })
  if (existsSync(worktree)) {
    const status = git(worktree, ['status', '--porcelain'])
    if (status === undefined || status !== '') throw new Error(`the PR worktree ${worktree} is not clean`)
    git(worktree, ['checkout', '--detach', head])
  } else {
    try {
      git(root, ['worktree', 'add', '--detach', worktree, head])
    } catch (error) {
      throw new Error(`cannot create ${worktree}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  const top = git(worktree, ['rev-parse', '--show-toplevel'])
  const common = git(worktree, ['rev-parse', '--path-format=absolute', '--git-common-dir'])
  if (top === undefined || resolve(top) !== resolve(worktree)) throw new Error(`the PR worktree ${worktree} does not resolve to itself`)
  if (common === undefined || resolve(common) !== resolve(paths.commonDir)) {
    throw new Error(`the PR worktree ${worktree} does not share the repository git directory`)
  }
  if (!existsSync(join(worktree, 'openspec', 'changes', change, '.openspec.yaml'))) {
    throw new Error(`PR #${n} does not contain the change ${change}`)
  }

  const state = loadState(root)
  const previous = state.prs[String(n)] ?? {}
  state.prs[String(n)] = {
    number: n,
    head,
    base: mergeBase,
    baseTip,
    change,
    worktree,
    round: previous.round ?? 0,
    status: 'prepared',
    error: null,
    commentId: previous.commentId ?? null,
    ...(previous.ownerReview === undefined ? {} : { ownerReview: previous.ownerReview }),
    updatedAt: new Date().toISOString(),
  }
  saveState(root, state)
  return { number: n, head, base: mergeBase, baseTip, change, worktree }
}

/** Escape a Markdown table cell. */
function cell(value) {
  return String(value ?? '').replaceAll('|', '\\|').replace(/\r?\n/gu, ' ')
}

/**
 * Render one review report as a PR comment.
 * @param report - `openspec_review action=report` report object.
 * @param facts - `{ number, head, round }`.
 * @returns Markdown.
 */
export function renderReport(report, facts) {
  const findings = Array.isArray(report?.findings) ? report.findings : []
  const verifications = Array.isArray(report?.verifications) ? report.verifications : []
  const outOfScope = Array.isArray(report?.outOfScope) ? report.outOfScope : []
  const residualRisks = Array.isArray(report?.residualRisks) ? report.residualRisks : []
  const lines = [
    `## Apply review — PR #${facts.number}, round ${facts.round}, head ${facts.head.slice(0, 12)}`,
    '',
    `**Verdict:** ${String(report?.verdict ?? 'blocked')}`,
    '',
    String(report?.summary ?? ''),
    '',
    '### Findings',
    '',
  ]
  if (findings.length === 0) {
    lines.push('No findings.')
  } else {
    lines.push('| id | severity | location | problem | suggestion |', '| --- | --- | --- | --- | --- |')
    for (const finding of findings) {
      lines.push(`| ${cell(finding.id)} | ${cell(finding.severity)} | ${cell(finding.location)} | ${cell(finding.problem)} | ${cell(finding.suggestion)} |`)
    }
  }
  lines.push('', '### Verifications', '')
  if (verifications.length === 0) {
    lines.push('None.')
  } else {
    for (const verification of verifications) {
      lines.push(`- ${cell(verification.id)}: ${cell(verification.status)} — ${cell(verification.evidence)}`)
    }
  }
  if (outOfScope.length > 0) {
    lines.push('', '### Out of scope', '')
    for (const item of outOfScope) lines.push(`- ${cell(item)}`)
  }
  if (residualRisks.length > 0) {
    lines.push('', '### Residual risks', '')
    for (const item of residualRisks) lines.push(`- ${cell(item)}`)
  }
  lines.push('', '<!-- pr-review: pr=' + facts.number + ' head=' + facts.head + ' round=' + facts.round + ' -->')
  return `${lines.join('\n')}\n`
}

/**
 * Build a trusted marker.
 * @param number - PR number.
 * @param head - head SHA.
 * @param round - round.
 * @returns marker text.
 */
export function marker(number, head, round) {
  return `<!-- pr-review: pr=${number} head=${head} round=${round} -->`
}

/**
 * Find a trusted marker in PR comments.
 * @param comments - `gh pr view --json comments` comments.
 * @param login - authenticated GitHub login.
 * @param number - PR number.
 * @param head - head SHA.
 * @returns true when a trusted marker exists.
 */
export function hasTrustedMarker(comments, login, number, head) {
  return (Array.isArray(comments) ? comments : []).some((comment) => {
    if (comment?.author?.login !== login) return false
    const match = MARKER_PATTERN.exec(String(comment?.body ?? ''))
    return match !== null && Number(match[1]) === Number(number) && match[2] === head
  })
}

/**
 * Whether a comment is a trusted pass for the PR head.
 * @param comments - `gh pr view --json comments` comments.
 * @param login - authenticated GitHub login.
 * @param number - PR number.
 * @param head - head SHA.
 * @returns true when the latest trusted marker for the head is a pass.
 */
export function trustedPass(comments, login, number, head) {
  const matching = (Array.isArray(comments) ? comments : []).filter((comment) => {
    if (comment?.author?.login !== login) return false
    return hasTrustedMarker([comment], login, number, head)
  })
  if (matching.length === 0) return false
  const latest = matching.at(-1)
  return /\*\*Verdict:\*\*\s*pass\b/iu.test(String(latest?.body ?? ''))
}

/**
 * Read a report file bound to a PR head.
 * @param file - report path.
 * @param number - PR number.
 * @param head - PR head.
 * @returns parsed report.
 */
export function readReport(file, number, head) {
  if (!existsSync(file)) throw new Error(`the report ${file} does not exist`)
  const report = readJson(file)
  if (report === null || typeof report !== 'object' || Array.isArray(report)) throw new Error(`the report ${file} is not an object`)
  if (report.head !== undefined && String(report.head) !== head) {
    throw new Error(`the report ${file} names head ${String(report.head)}, not ${head}`)
  }
  const base = file.split(/[\\/]/u).pop()
  if (base !== `pr-${number}-${head}.json`) {
    throw new Error(`the report ${file} must be named pr-${number}-${head}.json`)
  }
  return report
}

/**
 * Publish or dry-run one report comment.
 * @param options - root, PR number, report path, apply flag, gh runner.
 * @returns `{ published, marker, dryRun }`.
 */
export function publishComment({ root = process.cwd(), number, reportPath, apply = false, gh = ghText } = {}) {
  const n = Number(number)
  if (localPullRequestNumbers(root).has(String(n))) {
    throw new Error(`PR #${n} is owner-managed locally; the watch does not review or comment on it`)
  }
  const state = loadState(root)
  const entry = state.prs[String(number)]
  if (entry === undefined) throw new Error(`PR #${number} has no watch state; run prepare first`)
  const report = readReport(reportPath, Number(number), entry.head)
  const round = Number.isInteger(report.round) ? report.round : Number(entry.round ?? 0) + 1
  const text = renderReport(report, { number: Number(number), head: entry.head, round })
  if (!apply) return { published: false, marker: marker(Number(number), entry.head, round), dryRun: true, text }

  try {
    const login = gh(['api', 'user', '--jq', '.login'])
    if (login === undefined || login === '') throw new Error('gh is not authenticated; cannot verify comment authors')
    const comments = ghJson(gh, ['pr', 'view', String(number), '--json', 'comments']).comments
    if (hasTrustedMarker(comments, login, Number(number), entry.head)) {
      state.prs[String(number)] = { ...entry, round, status: 'commented', error: null, updatedAt: new Date().toISOString() }
      saveState(root, state)
      return { published: false, marker: marker(Number(number), entry.head, round), dryRun: false, already: true }
    }
    const temp = join(resolvePaths(root).cache, `.comment-${number}-${process.pid}.md`)
    writeFileSync(temp, text)
    try {
      const result = gh(['pr', 'comment', String(number), '--body-file', temp])
      if (result === undefined) throw new Error(`gh pr comment on #${number} failed`)
      state.prs[String(number)] = { ...entry, round, status: 'commented', error: null, commentId: result, updatedAt: new Date().toISOString() }
      saveState(root, state)
      return { published: true, marker: marker(Number(number), entry.head, round), dryRun: false, comment: result }
    } finally {
      rmSync(temp, { force: true })
    }
  } catch (error) {
    state.prs[String(number)] = {
      ...entry,
      status: 'failed',
      error: error instanceof Error ? error.message : String(error),
      updatedAt: new Date().toISOString(),
    }
    saveState(root, state)
    throw error
  }
}

/**
 * Record a failed review attempt without marking the head as published.
 * @param options - root, PR number and error text.
 * @returns the updated state entry.
 */
export function markFailed({ root = process.cwd(), number, error }) {
  const state = loadState(root)
  const key = String(number)
  const entry = state.prs[key]
  if (entry === undefined) throw new Error(`PR #${number} has no watch state; run prepare first`)
  state.prs[key] = {
    ...entry,
    status: 'failed',
    error: typeof error === 'string' && error !== '' ? error : 'the review step failed',
    updatedAt: new Date().toISOString(),
  }
  saveState(root, state)
  return state.prs[key]
}

/** Remove one apply state entry that names a worktree. */
function removeApplyState(root, change, worktree) {
  const paths = resolvePaths(root)
  const directory = join(paths.commonDir, 'openspec-flow', 'apply')
  if (!existsSync(directory)) return undefined
  let match
  for (const name of readdirSync(directory)) {
    if (!name.endsWith('.json')) continue
    const file = join(directory, name)
    const value = readJson(file)
    if (value?.change !== change) continue
    if (typeof value.worktree !== 'string' || resolve(value.worktree) !== resolve(worktree)) {
      throw new Error(`the apply state ${file} names ${String(value.worktree)}, not ${worktree}`)
    }
    match = file
  }
  if (match !== undefined) rmSync(match, { force: true })
  return match
}

/** Remove one PR checkout and its refs. */
function removeWorktree(root, number, worktree) {
  if (existsSync(worktree)) {
    const result = capture('git', ['-C', root, 'worktree', 'remove', '--force', worktree], { allowFailure: true })
    if (result.status !== 0) throw new Error(`cannot remove ${worktree}: ${String(result.stderr).trim()}`)
  }
  gitText(root, ['update-ref', '-d', `refs/pr-review/pr-${number}`], true)
  gitText(root, ['update-ref', '-d', `refs/pr-review/base-${number}`], true)
}

/**
 * Remove a tracked PR's checkout and matching apply state.
 * @param options - root, PR number, change and worktree.
 * @returns removed paths.
 */
export function forgetPullRequest({ root = process.cwd(), number, change, worktree } = {}) {
  const n = Number(number)
  if (!Number.isInteger(n) || n < 1 || typeof change !== 'string' || change === '') {
    throw new Error('forget needs a PR number and change')
  }
  const path = worktree ?? join(resolvePaths(root).worktrees, `pr-${n}`)
  const stateFile = removeApplyState(root, change, path)
  removeWorktree(root, n, path)
  const state = loadState(root)
  if (state.prs[String(n)] !== undefined) {
    delete state.prs[String(n)]
    saveState(root, state)
  }
  return { number: n, change, worktree: path, applyState: stateFile ?? null }
}

/**
 * Determine whether a tracked PR is closed or merged and remove it if so.
 * @param options - root, gh runner.
 * @returns cleanup results.
 */
export function cleanupClosedPullRequests({ root = process.cwd(), gh = ghText } = {}) {
  const state = loadState(root)
  const cleaned = []
  for (const [key, entry] of Object.entries(state.prs)) {
    // A recorded ownerReview head means the advisory label is still on the pull
    // request; keep the entry so the next reconcile retries a failed removal.
    if (entry.ownerReview !== undefined) continue
    const pr = ghJson(gh, ['pr', 'view', key, '--json', 'state,mergedAt'])
    if (pr.state === 'OPEN') continue
    cleaned.push(forgetPullRequest({ root, number: entry.number, change: entry.change, worktree: entry.worktree }))
  }
  const local = cleanupLocalEntries({ root, gh })
  return [
    ...cleaned,
    ...local.removed,
    ...local.retained.map((entry) => ({ ...entry, local: true, retained: true })),
  ]
}

/**
 * Read the state and optionally forget one change.
 * @param options - root, change, forget flag.
 * @returns state or cleanup result.
 */
export function stateCommand({ root = process.cwd(), change, forget = false } = {}) {
  if (!forget) return loadState(root)
  const state = loadState(root)
  const entries = Object.values(state.prs).filter((entry) => entry.change === change)
  const local = loadLocalState(root)
  const localEntries = Object.values(local.prs).filter((entry) => entry.change === change)
  if (entries.length === 0 && localEntries.length === 0) throw new Error(`no tracked PR changes ${change}`)
  const results = entries.map((entry) => forgetPullRequest({
    root,
    number: entry.number,
    change: entry.change,
    worktree: entry.worktree,
  }))
  for (const entry of localEntries) {
    delete local.prs[String(entry.number)]
    results.push({ number: entry.number, change: entry.change, local: true, removed: true })
  }
  if (localEntries.length > 0) saveLocalState(root, local)
  return results.length === 1 ? results[0] : results
}

/** Render usage. */
export function usage() {
  return [
    'usage: node scripts/pr-review-watch.mjs <command>',
    '',
    'commands:',
    '  poll [--json]                       list review candidates',
    '  preflight [--json]                  report GitHub, main and landing-lock readiness',
    '  prepare <n> [--json]                prepare a PR worktree',
    '  comment <n> --report <path> [--apply]  render or publish a report',
    '  state [--json] [--cleanup] [--forget <change>] [--fail <n> --error <text>]',
    '',
    'The default comment command is a dry run; --apply publishes to GitHub.',
  ].join('\n')
}

/** Parse one command line. */
export function parseArgs(argv) {
  const args = [...argv]
  const command = args.shift()
  if (command === undefined || command === '--help' || command === '-h') return { command: 'help' }
  if (!['poll', 'prepare', 'comment', 'state', 'preflight'].includes(command)) throw new UsageError(`unknown command '${command}'`)
  const options = { command, json: false, apply: false, cleanup: false, report: undefined, change: undefined, fail: undefined, error: undefined }
  const positional = []
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index]
    if (value === '--json') options.json = true
    else if (value === '--apply') options.apply = true
    else if (value === '--cleanup') options.cleanup = true
    else if (value === '--report' || value === '--forget' || value === '--fail' || value === '--error') {
      const next = args[index + 1]
      if (next === undefined || next === '' || next.startsWith('--')) throw new UsageError(`${value} needs a value`)
      if (value === '--report') options.report = next
      else if (value === '--forget') options.change = next
      else if (value === '--fail') options.fail = next
      else options.error = next
      index += 1
    } else if (value.startsWith('--')) throw new UsageError(`unknown argument '${value}'`)
    else positional.push(value)
  }
  if ((command === 'prepare' || command === 'comment') && positional.length !== 1) {
    throw new UsageError(`${command} needs one PR number`)
  }
  if (command === 'preflight' && positional.length !== 0) {
    throw new UsageError('preflight takes no positional argument')
  }
  if (positional.length > 1) throw new UsageError('unexpected positional arguments')
  options.number = positional[0] === undefined ? undefined : Number(positional[0])
  if (options.number !== undefined && (!Number.isInteger(options.number) || options.number < 1)) {
    throw new UsageError('the PR number must be a positive integer')
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
    if (options.command === 'preflight') {
      const result = preflight({ root })
      write(options.json ? `${JSON.stringify(result, null, 2)}\n` : `${result.reason ?? 'ready'}\n`)
      return 0
    }
    if (options.command === 'state') {
      if (options.cleanup || options.change !== undefined || options.fail !== undefined) {
        const result = withRunLock(root, () => {
          if (options.fail !== undefined) {
            const number = Number(options.fail)
            if (!Number.isInteger(number) || number < 1) throw new UsageError('--fail needs a positive PR number')
            return markFailed({ root, number, error: options.error })
          }
          return options.cleanup
            ? cleanupClosedPullRequests({ root })
            : stateCommand({ root, change: options.change, forget: true })
        })
        write(`${JSON.stringify(result, null, 2)}\n`)
        return 0
      }
      const state = loadState(root)
      write(options.json ? `${JSON.stringify(state, null, 2)}\n` : `${JSON.stringify(state.prs, null, 2)}\n`)
      return 0
    }
    const result = withRunLock(root, () => {
      if (options.command === 'poll') return pollPullRequests({ root })
      if (options.command === 'prepare') return preparePullRequest({ root, number: options.number })
      if (options.report === undefined) throw new UsageError('comment needs --report <path>')
      return publishComment({ root, number: options.number, reportPath: options.report, apply: options.apply })
    })
    if (options.command === 'comment' && !options.apply) {
      write(result.text)
      return 0
    }
    if (!options.json) {
      if (options.command === 'poll') {
        write(pollText(result))
        return 0
      }
      if (options.command === 'prepare') {
        write(`prepared PR #${result.number} at ${result.worktree}\n`)
        return 0
      }
      if (options.command === 'comment') {
        write(result.already
          ? `PR #${options.number} already has a comment for this head\n`
          : `published PR #${options.number}\n`)
        return 0
      }
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
