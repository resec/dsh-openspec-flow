#!/usr/bin/env node
/**
 * Maintain the advisory owner-review label on reviewed pull requests.
 *
 * The label is a queue signal only. It never authorizes landing and never
 * changes the maintainer-applied mergeable label. The default is a dry run;
 * only --apply writes labels and watch state.
 */

import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

import {
  activeChangeNames,
  checksGreen,
  loadState,
  mainWorktree,
  saveState,
  trustedPass,
  UsageError,
  withRunLock,
} from './pr-review-watch.mjs'

/** Advisory label managed by this command. */
export const OWNER_REVIEW_LABEL = 'owner-review'
/** Maintainer authorization label, never written by this command. */
export const MERGEABLE_LABEL = 'mergeable'
/** Fields read from one pull request. */
const PR_FIELDS = [
  'number',
  'state',
  'isDraft',
  'headRefOid',
  'baseRefName',
  'statusCheckRollup',
  'files',
  'labels',
  'mergeable',
  'mergeStateStatus',
  'comments',
].join(',')
/** Merge states that definitely invalidate the signal. */
const CONFLICTING_STATES = new Set(['DIRTY', 'BLOCKED'])

/** Run gh and return stdout, or undefined when allowed to fail. */
function ghText(args, { cwd, allowFailure = false } = {}) {
  const result = spawnSync('gh', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    if (allowFailure) return undefined
    const detail = String(result.stderr ?? '').trim() || String(result.stdout ?? '').trim()
    throw new Error(`gh ${args.join(' ')} failed${detail === '' ? '' : `: ${detail}`}`)
  }
  return result.stdout.trim()
}

/** Read one pull request through gh. */
export function readPullRequest({ root = process.cwd(), number, gh = ghText } = {}) {
  const text = gh(['pr', 'view', String(number), '--json', PR_FIELDS], { cwd: root })
  if (text === undefined) throw new Error(`gh pr view ${number} failed`)
  return JSON.parse(text)
}

/** Whether a pull request carries a label. */
export function hasLabel(pr, label) {
  return (Array.isArray(pr?.labels) ? pr.labels : [])
    .some((entry) => String(entry?.name ?? entry) === label)
}

/** Read the authenticated gh login. */
function ghLogin(root, gh) {
  const login = gh(['api', 'user', '--jq', '.login'], { cwd: root })
  if (login === undefined || login === '') {
    throw new Error('gh is not authenticated; cannot verify review authors')
  }
  return login
}

/** Whether one label mutation succeeds. */
function editLabel({ root, number, label, add, gh }) {
  const flag = add ? '--add-label' : '--remove-label'
  const result = gh(['pr', 'edit', String(number), flag, label], { cwd: root })
  if (result === undefined) throw new Error(`gh pr edit ${number} ${flag} ${label} failed`)
}

/** Record the labeled head in watch state. */
function recordOwnerReview(state, number, head, at) {
  const entry = state.prs[String(number)]
  if (entry === undefined) return false
  entry.ownerReview = { head, at }
  return true
}

/** Clear the recorded labeled head from watch state. */
function clearOwnerReview(state, number) {
  const entry = state.prs[String(number)]
  if (entry === undefined || entry.ownerReview === undefined) return false
  delete entry.ownerReview
  return true
}

/** Reason the PR cannot be labeled, ignoring mergeable status. */
function structuralReason(pr, entry, login) {
  const head = String(pr.headRefOid ?? '')
  if (pr.state !== 'OPEN') return 'closed'
  if (pr.isDraft === true) return 'draft'
  if (String(pr.baseRefName ?? '') !== 'main') return 'base'
  if (activeChangeNames(pr.files).length !== 1) return 'active-changes'
  if (!checksGreen(pr.statusCheckRollup)) return 'ci'
  if (hasLabel(pr, MERGEABLE_LABEL)) return 'mergeable-label'
  if (entry === undefined) return 'no-watch-state'
  if (String(entry.head ?? '') !== head) return 'state-head'
  if (entry.status !== 'commented') return 'state-status'
  if (!trustedPass(pr.comments, login, Number(pr.number), head)) return 'no-trusted-pass'
  return null
}

/** Reason the PR cannot be labeled, including mergeable status. */
function eligibilityReason(pr, entry, login) {
  const structural = structuralReason(pr, entry, login)
  if (structural !== null) return structural
  if (pr.mergeable !== 'MERGEABLE') return 'not-mergeable'
  if (CONFLICTING_STATES.has(String(pr.mergeStateStatus))) return 'conflict'
  return null
}

/**
 * Decide what to do with one pull request.
 * @returns {{action: string, reason: string, head: string}}.
 */
export function decideOwnerReview({ pr, entry, login, number = pr?.number }) {
  const head = String(pr?.headRefOid ?? '')
  const current = hasLabel(pr, OWNER_REVIEW_LABEL)
  if (!current) {
    const reason = eligibilityReason(pr, entry, login)
    return reason === null
      ? { action: 'add', reason: 'eligible', head, number: Number(number) }
      : { action: 'none', reason, head, number: Number(number) }
  }

  if (pr.state !== 'OPEN') return { action: 'remove', reason: 'closed', head, number: Number(number) }
  if (hasLabel(pr, MERGEABLE_LABEL)) {
    return { action: 'remove', reason: 'mergeable-label', head, number: Number(number) }
  }
  if (entry === undefined) return { action: 'remove', reason: 'no-watch-state', head, number: Number(number) }

  const labeledHead = entry.ownerReview?.head
  if (labeledHead !== undefined && String(labeledHead) !== head) {
    const reason = eligibilityReason(pr, entry, login)
    return reason === null
      ? { action: 'readd', reason: 'head-changed', head, number: Number(number) }
      : { action: 'remove', reason, head, number: Number(number) }
  }

  const structural = structuralReason(pr, entry, login)
  if (structural !== null) return { action: 'remove', reason: structural, head, number: Number(number) }
  if (CONFLICTING_STATES.has(String(pr.mergeStateStatus))) {
    return { action: 'remove', reason: 'conflict', head, number: Number(number) }
  }
  if (pr.mergeable === 'UNKNOWN') {
    return {
      action: entry.ownerReview === undefined ? 'adopt' : 'keep',
      reason: 'unknown',
      head,
      number: Number(number),
    }
  }
  if (pr.mergeable !== 'MERGEABLE') {
    return { action: 'remove', reason: 'not-mergeable', head, number: Number(number) }
  }
  return {
    action: entry.ownerReview === undefined ? 'adopt' : 'keep',
    reason: 'eligible',
    head,
    number: Number(number),
  }
}

/** Format one action for the human-readable output. */
function actionText(action, dryRun) {
  if (dryRun) {
    return {
      add: 'would add',
      remove: 'would remove',
      readd: 'would remove then add',
      adopt: 'would adopt',
      keep: 'would keep',
      none: 'would leave unchanged',
    }[action] ?? action
  }
  return {
    add: 'added',
    remove: 'removed',
    readd: 'removed then added',
    adopt: 'adopted',
    keep: 'kept',
    none: 'left unchanged',
  }[action] ?? action
}

/**
 * Add or remove the advisory label for one pull request.
 * @returns dry-run or applied result.
 */
export function syncPullRequest({
  root = process.cwd(),
  number,
  apply = false,
  gh = ghText,
  now = new Date().toISOString(),
} = {}) {
  const n = Number(number)
  if (!Number.isInteger(n) || n < 1) throw new UsageError('the PR number must be a positive integer')
  const pr = readPullRequest({ root, number: n, gh })
  const login = ghLogin(root, gh)
  const state = loadState(root)
  const entry = state.prs[String(n)]
  const decision = decideOwnerReview({ pr, entry, login, number: n })
  const result = {
    number: n,
    head: decision.head,
    action: decision.action,
    reason: decision.reason,
    dryRun: !apply,
    actions: [],
  }
  if (!apply) return result

  if (decision.action === 'remove' || decision.action === 'readd') {
    editLabel({ root, number: n, label: OWNER_REVIEW_LABEL, add: false, gh })
    result.actions.push('removed')
    if (clearOwnerReview(state, n)) {
      saveState(root, state)
      result.actions.push('state-cleared')
    }
  }

  if (decision.action === 'add' || decision.action === 'readd') {
    editLabel({ root, number: n, label: OWNER_REVIEW_LABEL, add: true, gh })
    result.actions.push('added')
    if (recordOwnerReview(state, n, decision.head, now)) {
      saveState(root, state)
      result.actions.push('state-recorded')
    }
  }

  if (decision.action === 'adopt' || (decision.action === 'keep' && entry?.ownerReview === undefined)) {
    if (recordOwnerReview(state, n, decision.head, now)) {
      saveState(root, state)
      result.actions.push('state-recorded')
    }
  }

  if (decision.action === 'none' && clearOwnerReview(state, n)) {
    saveState(root, state)
    result.actions.push('state-cleared')
  }

  return result
}

/**
 * Reconcile tracked pull requests and open pull requests carrying the label.
 * @returns per-PR results and collected errors.
 */
export function reconcileOwnerReview({ root = process.cwd(), apply = false, gh = ghText, now = new Date().toISOString() } = {}) {
  const state = loadState(root)
  const numbers = new Set(Object.keys(state.prs))
  const text = gh(['pr', 'list', '--state', 'open', '--limit', '100', '--json', 'number,labels'], { cwd: root })
  if (text === undefined) throw new Error('gh pr list failed')
  for (const pr of JSON.parse(text)) {
    if (hasLabel(pr, OWNER_REVIEW_LABEL)) numbers.add(String(pr.number))
  }

  const results = []
  const errors = []
  const ordered = [...numbers].filter((value) => /^\d+$/u.test(value)).sort((a, b) => Number(a) - Number(b))
  for (const key of ordered) {
    try {
      results.push(syncPullRequest({ root, number: Number(key), apply, gh, now }))
    } catch (error) {
      errors.push({ number: Number(key), error: error instanceof Error ? error.message : String(error) })
    }
  }
  return { dryRun: !apply, results, errors }
}

/** Render usage. */
export function usage() {
  return [
    'usage: node scripts/pr-review-owner-review.mjs <command>',
    '',
    'commands:',
    '  <n> [--apply] [--json]            add or remove owner-review for one PR',
    '  --reconcile [--apply] [--json]    reconcile tracked and labeled PRs',
    '',
    'The default is a dry run; only --apply writes labels and watch state.',
  ].join('\n')
}

/** Parse one command line. */
export function parseArgs(argv) {
  const args = [...argv]
  const help = args.includes('--help') || args.includes('-h')
  if (help) return { command: 'help', number: undefined, apply: false, json: false }
  const options = { command: 'one', number: undefined, apply: false, json: false }
  if (args[0] === '--reconcile') {
    options.command = 'reconcile'
    args.shift()
  } else if (args[0] !== undefined && !args[0].startsWith('-')) {
    const n = Number(args.shift())
    if (!Number.isInteger(n) || n < 1) throw new UsageError('the PR number must be a positive integer')
    options.number = n
  } else {
    throw new UsageError('owner-review needs a PR number or --reconcile')
  }
  for (const arg of args) {
    if (arg === '--apply') options.apply = true
    else if (arg === '--json') options.json = true
    else if (arg.startsWith('--')) throw new UsageError(`unknown argument '${arg}'`)
    else throw new UsageError('unexpected positional argument')
  }
  return options
}

/** CLI entry. */
export function main(argv = process.argv.slice(2), write = (text) => process.stdout.write(text), options = {}) {
  try {
    const parsed = parseArgs(argv)
    if (parsed.command === 'help') {
      write(`${usage()}\n`)
      return 0
    }
    const root = options.root ?? mainWorktree()
    const gh = options.gh ?? ghText
    const result = withRunLock(root, () => (
      parsed.command === 'reconcile'
        ? reconcileOwnerReview({ root, apply: parsed.apply, gh })
        : syncPullRequest({ root, number: parsed.number, apply: parsed.apply, gh })
    ))
    if (parsed.json) {
      write(`${JSON.stringify(result, null, 2)}\n`)
      return 0
    }
    if (parsed.command === 'reconcile') {
      const lines = result.results.map((entry) => (
        `PR #${entry.number}: ${actionText(entry.action, result.dryRun)} owner-review (${entry.reason})`
      ))
      for (const failure of result.errors) lines.push(`PR #${failure.number}: error: ${failure.error}`)
      write(`${lines.length === 0 ? 'no tracked or labeled pull requests\n' : `${lines.join('\n')}\n`}`)
      return 0
    }
    write(`PR #${result.number}: ${actionText(result.action, result.dryRun)} owner-review (${result.reason})\n`)
    return 0
  } catch (error) {
    write(`${error instanceof Error ? error.message : String(error)}\n`)
    return error instanceof UsageError ? 2 : 1
  }
}

if (process.argv[1] !== undefined && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = main()
}
