/**
 * Shared deterministic helpers for the local PR publish and landing scripts.
 *
 * The scripts read plugin state, review records and git facts; they never call
 * plugin tools. A DSH session owns the review and the land.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { spawnSync } from 'node:child_process'

import { resolvePaths } from './pr-review-watch.mjs'

/** Landing phases that keep a PR unfinished. */
export const OPEN_LANDING_PHASES = new Set([
  'prepared', 'review-failed', 'reviewed', 'archive-pending', 'archive-failed', 'archived', 'push-pending',
])

/** Run a command and return the spawn result. */
export function run(command, args, { cwd, allowFailure = false } = {}) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  if (result.error) throw result.error
  if (result.status !== 0 && !allowFailure) {
    const detail = String(result.stderr ?? '').trim() || String(result.stdout ?? '').trim()
    throw new Error(`${command} ${args.join(' ')} failed${detail === '' ? '' : `: ${detail}`}`)
  }
  return result
}

/** Git output, or undefined on failure. */
export function gitText(cwd, args, allowFailure = false) {
  const result = run('git', ['-C', cwd, ...args], { allowFailure })
  if (result.status !== 0) return undefined
  return result.stdout.trim()
}

/** Gh output, or undefined on failure. */
export function ghText(args, cwd) {
  const result = run('gh', args, { cwd, allowFailure: true })
  if (result.status !== 0) return undefined
  return result.stdout.trim()
}

/** Read a JSON file, returning undefined when absent. */
export function readJson(file) {
  if (!existsSync(file)) return undefined
  return JSON.parse(readFileSync(file, 'utf8'))
}

/**
 * Read the active plugin apply state for one change.
 * @param root - main worktree.
 * @param change - change name.
 * @returns `{ file, state }`, or undefined.
 */
export function readApplyState(root, change) {
  const common = resolvePaths(root).commonDir
  if (common === undefined) throw new Error(`${root} is not a git repository`)
  const directory = join(common, 'openspec-flow', 'apply')
  if (!existsSync(directory)) return undefined
  for (const name of readdirSync(directory)) {
    if (!name.endsWith('.json')) continue
    const file = join(directory, name)
    const state = readJson(file)
    if (state?.change !== change) continue
    return { file, state }
  }
  return undefined
}

/**
 * Find the active plugin apply state for a worktree or change.
 * @param root - main worktree.
 * @param options - worktree path and optional change name.
 * @returns `{ file, state }`, or undefined.
 */
export function findApplyState(root, { worktree, change } = {}) {
  const common = resolvePaths(root).commonDir
  if (common === undefined) throw new Error(`${root} is not a git repository`)
  const directory = join(common, 'openspec-flow', 'apply')
  if (!existsSync(directory)) return undefined
  for (const name of readdirSync(directory)) {
    if (!name.endsWith('.json')) continue
    const file = join(directory, name)
    let state
    try {
      state = readJson(file)
    } catch {
      continue
    }
    if (state === null || typeof state !== 'object') continue
    if (change !== undefined && state.change !== change) continue
    if (worktree !== undefined && (typeof state.worktree !== 'string' || resolve(state.worktree) !== resolve(worktree))) continue
    return { file, state }
  }
  return undefined
}

/** Resolve the apply review record for one change. */
export function reviewRecordPath(root, change) {
  const common = resolvePaths(root).commonDir
  if (common === undefined) return undefined
  const directory = join(common, 'openspec-flow', 'review')
  let key = `local#${change}`
  if (!existsSync(join(directory, key)) && existsSync(directory)) {
    const match = readdirSync(directory).find((name) => name.endsWith(`#${change}`))
    if (match !== undefined) key = match
  }
  return join(directory, key, 'apply-review.json')
}

/**
 * Verify the apply review is passed, current and finding-free.
 * @param options - root, change and reviewed tree.
 * @returns the review record.
 */
export function assertReviewReady({ root, change, tree }) {
  const file = reviewRecordPath(root, change)
  const record = file === undefined ? undefined : readJson(file)
  if (record === undefined) throw new Error(`the apply review record for ${change} is missing`)
  if (record.state !== 'passed') throw new Error(`the apply review state is ${String(record.state)}, not passed`)
  if (record.treeSha !== tree) throw new Error(`the apply review tree ${String(record.treeSha)} does not match ${tree}`)
  const open = Array.isArray(record.findings) ? record.findings.filter((finding) => finding?.status === 'open') : []
  if (open.length > 0) throw new Error(`the apply review still has ${open.length} open finding(s)`)
  return record
}

/** Verify the main planning copy still matches the seal. */
export function assertPlanningCopy({ root, change, sealedCommit }) {
  if (typeof sealedCommit !== 'string' || sealedCommit === '') {
    throw new Error('the apply state has no seal commit')
  }
  const changePath = `openspec/changes/${change}`
  const ignorePath = 'openspec/.gitignore'
  const candidates = (gitText(root, ['ls-files', '--others', '--exclude-standard', '--', changePath]) ?? '')
    .split('\n').map((line) => line.trim()).filter((line) => line !== '')
  const ignoreTracked = gitText(root, ['ls-files', '--error-unmatch', '--', ignorePath], true) !== undefined
  if (!ignoreTracked && existsSync(join(root, ignorePath)) && !candidates.includes(ignorePath)) candidates.push(ignorePath)
  for (const path of candidates) {
    const blob = spawnSync('git', ['-C', root, 'show', `${sealedCommit}:${path}`], { encoding: 'buffer' })
    if (blob.status !== 0) throw new Error(`the main planning copy ${path} is not in the seal`)
    const bytes = readFileSync(join(root, path))
    if (!bytes.equals(blob.stdout)) throw new Error(`the main planning copy ${path} differs from the seal`)
  }
  if (ignoreTracked && gitText(root, ['status', '--porcelain', '--', ignorePath]) !== '') {
    const blob = spawnSync('git', ['-C', root, 'show', `${sealedCommit}:${ignorePath}`], { encoding: 'buffer' })
    if (blob.status !== 0) throw new Error(`the tracked ${ignorePath} is not in the seal`)
    if (!readFileSync(join(root, ignorePath)).equals(blob.stdout)) {
      throw new Error(`the tracked ${ignorePath} differs from the seal`)
    }
  }
}

/** Whether GitHub is reachable through the authenticated gh. */
export function assertOnline(gh = ghText, cwd) {
  const repo = gh(['repo', 'view', '--json', 'nameWithOwner'], cwd)
  if (repo === undefined) throw new Error('github-unreachable')
  return JSON.parse(repo)
}

/** Read local main against origin main after a fetch. */
export function readLocalMain({ root, git = gitText } = {}) {
  const fetched = git(root, ['fetch', 'origin', 'main'], true) !== undefined
  const main = git(root, ['rev-parse', 'main'])
  const originMain = git(root, ['rev-parse', 'origin/main'])
  if (main === undefined || originMain === undefined) throw new Error('cannot resolve local main and origin/main')
  const ahead = Number(git(root, ['rev-list', '--count', 'origin/main..main']) ?? '0')
  const behind = Number(git(root, ['rev-list', '--count', 'main..origin/main']) ?? '0')
  return { main, originMain, ahead, behind, fetched }
}

/** Read the landing state. */
export function readLandings(root) {
  const file = join(resolvePaths(root).cache, 'landings.json')
  const value = readJson(file)
  if (value === undefined) return { schemaVersion: 1, lands: {} }
  if (value === null || typeof value !== 'object' || value.lands === null || typeof value.lands !== 'object') {
    throw new Error(`the landing state ${file} is not valid`)
  }
  return value
}

/** Refuse when a landing is open for another PR. */
export function assertNoOpenLanding(root, number) {
  for (const [key, entry] of Object.entries(readLandings(root).lands)) {
    if (String(number) === key) continue
    if (OPEN_LANDING_PHASES.has(entry?.phase)) {
      throw new Error(`PR #${key} is already landing in phase ${entry.phase}`)
    }
  }
}

/** Read one pull request through gh. */
export function readPullRequest({ root, number, gh = ghText } = {}) {
  const text = gh([
    'pr', 'view', String(number), '--json',
    'number,state,isDraft,headRefOid,baseRefName,mergeCommit,isCrossRepository,url,body,labels',
  ], root)
  if (text === undefined) throw new Error(`gh pr view ${number} failed`)
  return JSON.parse(text)
}

/** The local publication audit marker. */
export function localMarker({ change, tree, record, session }) {
  return `<!-- local-apply-review: change=${change} tree=${tree} review=${record} session=${session} -->`
}

/** Read the landed manifest that matches a change and reviewed tree. */
export function readLandedManifest({ root, change, tree }) {
  const directory = join(resolvePaths(root).commonDir, 'openspec-flow', 'landed')
  if (!existsSync(directory)) return undefined
  for (const name of readdirSync(directory)) {
    if (!name.endsWith('.json')) continue
    let manifest
    try {
      manifest = readJson(join(directory, name))
    } catch {
      continue
    }
    if (manifest?.change === change && manifest?.featureTree === tree) return { file: join(directory, name), manifest }
  }
  return undefined
}

/** Whether an untracked path is under another change directory. */
export function isPluginWorktree(root, path) {
  return resolve(path).startsWith(`${join(root, '.cache', 'openspec-flow', 'worktrees')}${sep}`)
}
