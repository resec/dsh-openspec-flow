#!/usr/bin/env node
/**
 * Publish a reviewed plugin apply worktree as a local pull request.
 *
 * The command verifies the apply review, the worktree and the main planning
 * copy, pushes the reviewed branch, opens the pull request as a draft, writes
 * the local owner entry under the main worktree's `.cache/pr-review/`, marks
 * the pull request ready and acquires the cross-session landing lock. It is a
 * dry run unless `--apply` is passed.
 *
 * The local owner entry is the ownership authority. No `mergeable` or
 * `owner-review` label is written and no review comment is published.
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  loadLocalState,
  saveLocalState,
  findLocalEntry,
  mainWorktree,
  OFFLINE_LAND_COMMAND,
} from './pr-review-watch.mjs'
import {
  acquireLock,
  readLockOwner,
} from './pr-review-lock.mjs'
import {
  assertNoOpenLanding,
  assertPlanningCopy,
  assertReviewReady,
  findApplyState,
  ghText,
  gitText,
  isPluginWorktree,
  localMarker,
  readLocalMain,
} from './pr-local-shared.mjs'

/** The phase a successfully published owner entry records. */
export const PUBLISHED_PHASE = 'published'

/** A usage error, mapped to exit code 2. */
class PublishUsageError extends Error {
  /** @param message - diagnostic. */
  constructor(message) {
    super(message)
    this.name = 'PublishUsageError'
  }
}

/** Git output, throwing on failure. */
function gitOrThrow(git, cwd, args) {
  const text = git(cwd, args)
  if (text === undefined) throw new Error(`git ${args.join(' ')} failed in ${cwd}`)
  return text
}

/** Resolve one local owner entry or require its session. */
function requireOwnerSession(entry, session) {
  if (entry !== undefined && entry.ownerSession !== session) {
    throw new Error(`the local pull request #${entry.number} belongs to session ${entry.ownerSession}`)
  }
}

/**
 * The pull-request body carrying the audit marker.
 * @param facts - change, tree, record id and session.
 * @returns Markdown.
 */
export function publishBody({ change, tree, record, session }) {
  return [
    `Local owner-managed pull request for the OpenSpec change \`${change}\`.`,
    '',
    'The reviewed tree was published by its owner session; the scheduled review watch skips this pull request.',
    '',
    localMarker({ change, tree, record, session }),
    '',
  ].join('\n')
}

/** Parse the pull-request number from a `gh pr create` URL. */
export function pullRequestNumber(text) {
  const match = /(?:^|\/)(\d+)\s*$/u.exec(String(text ?? '').trim())
  if (match === null) return undefined
  const number = Number(match[1])
  return Number.isInteger(number) && number > 0 ? number : undefined
}

/** List pull requests whose head is one branch. */
export function listBranchPullRequests({ root, branch, gh = ghText }) {
  const text = gh([
    'pr', 'list', '--head', branch, '--state', 'all', '--json',
    'number,state,isDraft,url,headRefOid',
  ], root)
  if (text === undefined) throw new Error(`gh pr list --head ${branch} failed`)
  return JSON.parse(text)
}

/**
 * Evaluate every publication gate without writing.
 * @param options - root, worktree, change, session, token and runners.
 * @returns facts, or `{ offline: true, reason }` when the online path is unavailable.
 */
export function publishGates({
  root,
  worktree = process.cwd(),
  change,
  session,
  token,
  gh = ghText,
  git = gitText,
} = {}) {
  if (typeof session !== 'string' || session.trim() === '') {
    throw new PublishUsageError('publish needs --session <id>')
  }
  const found = findApplyState(root, { worktree, change })
  if (found === undefined) {
    throw new Error(`${worktree} is not an active plugin apply worktree${change === undefined ? '' : ` for ${change}`}`)
  }
  const state = found.state
  const name = state.change
  if (!isPluginWorktree(root, worktree)) {
    throw new Error(`${worktree} is not a plugin worktree under ${join(root, '.cache', 'openspec-flow', 'worktrees')}`)
  }
  if (state.status !== 'active') throw new Error(`the apply state for ${name} is ${String(state.status)}, not active`)
  const dirty = gitOrThrow(git, worktree, ['status', '--porcelain'])
  if (dirty !== '') throw new Error(`the apply worktree is not clean:\n${dirty}`)
  const head = gitOrThrow(git, worktree, ['rev-parse', 'HEAD'])
  const tree = gitOrThrow(git, worktree, ['rev-parse', 'HEAD^{tree}'])
  const record = assertReviewReady({ root, change: name, tree })
  assertPlanningCopy({ root, change: name, sealedCommit: state.sealedCommit })
  const entry = findLocalEntry(root, { change: name })
  requireOwnerSession(entry, session)
  const lock = readLockOwner(root)
  if (lock !== undefined) {
    if (lock.ownerSession !== session) {
      throw new Error(`the landing lock is held by session ${lock.ownerSession} for PR #${lock.pr}`)
    }
    if (typeof token !== 'string' || token.trim() === '' || token !== lock.token) {
      throw new Error(`the landing lock is held by session ${session}; pass the recorded --token`)
    }
  }
  const repo = gh(['repo', 'view', '--json', 'nameWithOwner'], root)
  if (repo === undefined) return { offline: true, reason: 'github-unreachable', change: name }
  const localMain = readLocalMain({ root, git })
  if (!localMain.fetched) return { offline: true, reason: 'origin-unreachable', change: name }
  if (localMain.ahead !== 0) {
    throw new Error(`local main leads origin/main by ${localMain.ahead} commit(s); run node scripts/push-landed.mjs --push before publishing`)
  }
  assertNoOpenLanding(root)
  const pullRequests = listBranchPullRequests({ root, branch: state.branch, gh })
  const closed = pullRequests.find((pr) => pr.state !== 'OPEN')
  if (closed !== undefined) {
    throw new Error(`the pull request #${closed.number} for ${state.branch} is ${String(closed.state).toLowerCase()}; it is not reopened`)
  }
  const open = pullRequests.find((pr) => pr.state === 'OPEN')
  if (entry !== undefined && open !== undefined && entry.number !== open.number) {
    throw new Error(`the local entry for ${name} names PR #${entry.number}, but the branch has open PR #${open.number}`)
  }
  return {
    offline: false,
    change: name,
    branch: state.branch,
    head,
    tree,
    record,
    entry,
    open,
    state,
    localMain,
  }
}

/** Write one local owner entry. */
function writeEntry(root, facts, number, now) {
  const state = loadLocalState(root)
  if (facts.entry !== undefined && facts.entry.number !== number) {
    delete state.prs[String(facts.entry.number)]
  }
  const previous = state.prs[String(number)]
  state.prs[String(number)] = {
    number,
    change: facts.change,
    branch: facts.branch,
    head: facts.head,
    tree: facts.tree,
    record: facts.recordId,
    ownerSession: facts.session,
    phase: PUBLISHED_PHASE,
    publishedAt: previous?.publishedAt ?? now,
    updatedAt: now,
  }
  saveLocalState(root, state)
  return state.prs[String(number)]
}

/** Record a failed publication on an entry that already exists. */
function recordFailure(root, number, now) {
  const state = loadLocalState(root)
  const entry = state.prs[String(number)]
  if (entry === undefined) return
  state.prs[String(number)] = { ...entry, phase: 'failed', updatedAt: now }
  saveLocalState(root, state)
}

/**
 * Publish or dry-run one local pull request.
 * @param options - root, worktree, change, session, token, apply and runners.
 * @returns the outcome.
 */
export function publishPullRequest({
  root,
  worktree = process.cwd(),
  change,
  session,
  token,
  apply = false,
  gh = ghText,
  git = gitText,
  now = new Date().toISOString(),
} = {}) {
  const gates = publishGates({ root, worktree, change, session, token, gh, git })
  if (gates.offline) {
    return {
      offlineLand: true,
      action: 'offline-land',
      reason: gates.reason,
      command: OFFLINE_LAND_COMMAND,
      change: gates.change,
      dryRun: !apply,
      number: null,
      lock: null,
    }
  }
  const recordId = typeof gates.record.id === 'string' && gates.record.id !== ''
    ? gates.record.id
    : `local#${gates.change}`
  const facts = {
    change: gates.change,
    branch: gates.branch,
    head: gates.head,
    tree: gates.tree,
    recordId,
    session,
    entry: gates.entry,
    open: gates.open,
  }
  const result = {
    offlineLand: false,
    change: gates.change,
    branch: gates.branch,
    head: gates.head,
    tree: gates.tree,
    record: recordId,
    session,
    number: gates.open?.number ?? null,
    action: gates.open === undefined ? 'create' : 'update',
    dryRun: !apply,
  }
  if (!apply) return result

  let number = result.number
  let entryWritten = false
  try {
    const pushed = git(worktree, ['push', '--force-with-lease', 'origin', `${gates.head}:refs/heads/${gates.branch}`])
    if (pushed === undefined) throw new Error(`git push ${gates.branch} failed`)
    const body = publishBody({ change: gates.change, tree: gates.tree, record: recordId, session })
    const directory = mkdtempSync(join(tmpdir(), 'dsh-pr-publish-'))
    const bodyFile = join(directory, 'body.md')
    writeFileSync(bodyFile, body)
    try {
      if (number === null) {
        const created = gh([
          'pr', 'create', '--draft', '--base', 'main', '--head', gates.branch,
          '--title', `local: ${gates.change}`, '--body-file', bodyFile,
        ], root)
        if (created === undefined) throw new Error('gh pr create failed')
        number = pullRequestNumber(created)
        if (number === undefined) {
          const viewed = gh(['pr', 'view', gates.branch, '--json', 'number'], root)
          if (viewed === undefined) throw new Error(`cannot resolve the new pull request for ${gates.branch}`)
          number = JSON.parse(viewed).number
        }
      } else {
        const edited = gh(['pr', 'edit', String(number), '--body-file', bodyFile], root)
        if (edited === undefined) throw new Error(`gh pr edit ${number} failed`)
      }
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
    if (!Number.isInteger(number) || number < 1) throw new Error('the new pull request has no number')
    writeEntry(root, facts, number, now)
    entryWritten = true
    const ready = gh(['pr', 'ready', String(number)], root)
    if (ready === undefined) throw new Error(`gh pr ready ${number} failed`)
    const owner = acquireLock({ root, session, token, pr: number })
    return {
      ...result,
      number,
      action: result.action === 'create' ? 'created' : 'updated',
      pushed: true,
      ready: true,
      lock: { ownerSession: owner.ownerSession, token: owner.token, pr: owner.pr },
    }
  } catch (error) {
    if (entryWritten && number !== null) recordFailure(root, number, now)
    throw error
  }
}

/** Render usage. */
export function usage() {
  return [
    'usage: node scripts/pr-publish.mjs [options]',
    '',
    'options:',
    '  --change <name>     change to publish; defaults to the worktree apply state',
    '  --session <id>      owner session label recorded in the local state and lock',
    '  --token <token>     landing-lock token for a repeated publication',
    '  --json              print the result as JSON',
    '  --apply             push the branch, publish, write state and acquire the lock',
    '',
    'The default is a dry run. The command publishes no label and no review comment.',
  ].join('\n')
}

/** Parse one command line. */
export function parseArgs(argv) {
  const options = { command: 'publish', apply: false, json: false, change: undefined, session: undefined, token: undefined }
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === '--help' || value === '-h') return { command: 'help' }
    if (value === '--apply') options.apply = true
    else if (value === '--json') options.json = true
    else if (['--change', '--session', '--token'].includes(value)) {
      const next = argv[index + 1]
      if (next === undefined || next === '' || next.startsWith('--')) {
        throw new PublishUsageError(`${value} needs a value`)
      }
      if (value === '--change') options.change = next
      else if (value === '--session') options.session = next
      else options.token = next
      index += 1
    } else if (value.startsWith('--')) throw new PublishUsageError(`unknown argument '${value}'`)
    else throw new PublishUsageError(`unexpected argument '${value}'`)
  }
  if (options.session === undefined) throw new PublishUsageError('publish needs --session <id>')
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
    const result = publishPullRequest({
      root,
      worktree: process.cwd(),
      change: options.change,
      session: options.session,
      token: options.token,
      apply: options.apply,
    })
    if (options.json) write(`${JSON.stringify(result, null, 2)}\n`)
    else if (result.offlineLand) {
      write(`offline-land: ${result.reason}; ${result.command}\n`)
    } else if (result.dryRun) {
      write(`PR #${result.number ?? '(new)'} ${result.action} for ${result.change} from ${result.branch} at ${result.head.slice(0, 12)} (dry run)\n`)
    } else {
      write(`published PR #${result.number} for ${result.change}; landing lock owner session ${result.lock.ownerSession} token ${result.lock.token}\n`)
    }
    return 0
  } catch (error) {
    write(`${error instanceof Error ? error.message : String(error)}\n`)
    return error instanceof PublishUsageError ? 2 : 1
  }
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = main()
}
