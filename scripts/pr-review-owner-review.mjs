#!/usr/bin/env node
/**
 * Maintain the advisory owner-review label on reviewed pull requests.
 *
 * The label is a queue signal only. It never authorizes landing and never
 * changes the maintainer-applied mergeable label. The default is a dry run;
 * only --apply writes labels and watch state.
 */

import { pathToFileURL } from 'node:url'

import { ghRead, ghWrite } from './gh-exec.mjs'

import {
  activeChangeNames,
  checksGreen,
  hasTrustedMarker,
  loadState,
  localPullRequestNumbers,
  mainWorktree,
  repositorySlug,
  saveState,
  trustedPass,
  UsageError,
  withRunLock,
  withRunTelemetry,
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

/** Whether one `gh` invocation mutates a label. */
export function isLabelWrite(args) {
  return args[0] === 'pr' && args[1] === 'edit'
}

/**
 * Run gh: a label write stays single-shot, every read retries under the shared
 * policy. Returns stdout, or undefined when the failure is allowed.
 */
function ghText(args, { cwd, allowFailure = false } = {}) {
  return isLabelWrite(args)
    ? ghWrite(args, { cwd, allowFailure })
    : ghRead(args, { cwd, allowFailure })
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
  if (localPullRequestNumbers(root).has(String(n))) {
    return {
      number: n,
      head: String(pr.headRefOid ?? ''),
      action: 'none',
      reason: 'local-owner',
      dryRun: !apply,
      actions: [],
    }
  }
  const login = ghLogin(root, gh)
  const state = loadState(root)
  const decision = decideOwnerReview({ pr, entry: state.prs[String(n)], login, number: n })
  return applyOwnerReviewDecision({ root, number: n, decision, apply, gh, now, state })
}

/**
 * Apply one owner-review decision to GitHub and watch state.
 * @returns the per-pull-request result.
 */
function applyOwnerReviewDecision({ root, number, decision, apply, gh, now, state }) {
  const n = Number(number)
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

  if (decision.action === 'adopt') {
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

/** Cheap list fields for the reconcile screening pass. */
export const RECONCILE_LIST_FIELDS = 'number,state,isDraft,headRefOid,baseRefName,labels,statusCheckRollup'
/** Maximum pull requests read in one batched detail request. */
export const DETAIL_CHUNK_SIZE = 25
/** Comments read from one batched detail request. */
const COMMENT_WINDOW = 10

/** Read one batched detail request and return the nodes it carries. */
function readDetailChunk({ root, gh, owner, name, numbers }) {
  const parts = numbers.map((n) => (
    `p${n}:pullRequest(number:${n}){mergeable mergeStateStatus comments(last:${COMMENT_WINDOW}){nodes{author{login} body}}}`
  ))
  const query = `query{repository(owner:${JSON.stringify(owner)},name:${JSON.stringify(name)}){${parts.join(' ')}}}`
  const text = gh(['api', 'graphql', '-f', `query=${query}`], { cwd: root })
  if (text === undefined) throw new Error('the batched detail read returned nothing')
  const repository = JSON.parse(text)?.data?.repository
  if (repository === null || typeof repository !== 'object') {
    throw new Error('the batched detail read returned no repository')
  }
  const details = new Map()
  for (const number of numbers) {
    const node = repository[`p${number}`]
    if (node !== null && typeof node === 'object') details.set(number, node)
  }
  return details
}

/**
 * Read the changed files of several pull requests in one request. A pull
 * request whose file list has another page is reported as truncated so the
 * caller can read it one pull request at a time.
 */
function readFilesChunk({ root, gh, owner, name, numbers }) {
  const parts = numbers.map((n) => `p${n}:pullRequest(number:${n}){files(first:100){pageInfo{hasNextPage} nodes{path}}}`)
  const query = `query{repository(owner:${JSON.stringify(owner)},name:${JSON.stringify(name)}){${parts.join(' ')}}}`
  const text = gh(['api', 'graphql', '-f', `query=${query}`], { cwd: root })
  if (text === undefined) throw new Error('the batched file read returned nothing')
  const repository = JSON.parse(text)?.data?.repository
  if (repository === null || typeof repository !== 'object') {
    throw new Error('the batched file read returned no repository')
  }
  const files = new Map()
  for (const number of numbers) {
    const value = repository[`p${number}`]?.files
    if (value === undefined || value === null) continue
    if (value.pageInfo?.hasNextPage === true) {
      files.set(number, null)
      continue
    }
    if (Array.isArray(value.nodes)) files.set(number, value.nodes)
  }
  return files
}

/** The evidence object the decider reads for a tracked pull request. */
function evidencePullRequest({ row, entry, detail, files }) {
  const change = typeof entry?.change === 'string' && entry.change !== ''
    ? entry.change
    : 'unknown-change'
  return {
    ...row,
    ...(detail ?? {}),
    files: files ?? [{ path: `openspec/changes/${change}/placeholder.md` }],
  }
}

/**
 * Reconcile tracked pull requests and open pull requests carrying the label.
 * Reads are batched: one login, one lightweight list, chunked detail requests of
 * at most {@link DETAIL_CHUNK_SIZE} pull requests, and per-pull-request file or
 * comment reads only where a decision needs them.
 * @returns per-pull-request results and collected errors.
 */
export function reconcileOwnerReview({ root = process.cwd(), apply = false, gh = ghText, now = new Date().toISOString() } = {}) {
  const state = loadState(root)
  const local = localPullRequestNumbers(root)
  const login = ghLogin(root, gh)
  const listText = gh(['pr', 'list', '--state', 'all', '--limit', '1000', '--json', RECONCILE_LIST_FIELDS], { cwd: root })
  if (listText === undefined) throw new Error('gh pr list failed')
  const rows = Array.isArray(JSON.parse(listText)) ? JSON.parse(listText) : []
  const known = new Map()
  const open = new Map()
  for (const row of rows) {
    const number = Number(row?.number)
    if (!Number.isInteger(number) || number < 1) continue
    known.set(number, row)
    if (row?.state === undefined || String(row.state) === 'OPEN') open.set(number, row)
  }

  const numbers = new Set()
  for (const key of Object.keys(state.prs)) {
    const number = Number(key)
    if (Number.isInteger(number) && number > 0) numbers.add(number)
  }
  for (const row of open.values()) {
    if (hasLabel(row, OWNER_REVIEW_LABEL)) numbers.add(Number(row.number))
  }
  for (const key of local) numbers.delete(Number(key))
  const ordered = [...numbers].sort((left, right) => left - right)

  const results = []
  const errors = []
  const plans = new Map()
  const detailNumbers = []
  const filesFor = new Map()

  const stopItem = ({ number, head, labeled }, reason) => {
    plans.set(number, labeled
      ? { number, head, action: 'remove', reason }
      : { number, head, action: 'none', reason })
  }

  const pendingFiles = []
  for (const number of ordered) {
    const row = known.get(number)
    const entry = state.prs[String(number)]
    if (row === undefined) {
      try {
        const pr = readPullRequest({ root, number, gh })
        plans.set(number, decideOwnerReview({ pr, entry, login, number }))
      } catch (error) {
        errors.push({ number, error: error instanceof Error ? error.message : String(error) })
      }
      continue
    }
    const head = String(row.headRefOid ?? '')
    const labeled = hasLabel(row, OWNER_REVIEW_LABEL)
    const item = { number, row, head, labeled }
    if (row.state !== undefined && String(row.state) !== 'OPEN') { stopItem(item, 'closed'); continue }
    if (row.isDraft === true) { stopItem(item, 'draft'); continue }
    if (String(row.baseRefName ?? '') !== 'main') { stopItem(item, 'base'); continue }
    if (entry === undefined || String(entry.head ?? '') !== head) {
      pendingFiles.push({ ...item, entry })
      continue
    }
    if (!checksGreen(row.statusCheckRollup)) { stopItem(item, 'ci'); continue }
    if (hasLabel(row, MERGEABLE_LABEL)) { stopItem(item, 'mergeable-label'); continue }
    if (entry.status !== 'commented') { stopItem(item, 'state-status'); continue }
    detailNumbers.push({ number, row, entry })
  }

  if (pendingFiles.length > 0) {
    const slug = repositorySlug(root)
    const fileNumbers = pendingFiles.map((item) => item.number)
    const readFilesOne = (numbers) => {
      for (const number of numbers) {
        try {
          const pr = readPullRequest({ root, number, gh })
          filesFor.set(number, Array.isArray(pr?.files) ? pr.files : [])
        } catch (readError) {
          errors.push({ number, error: readError instanceof Error ? readError.message : String(readError) })
        }
      }
    }
    if (slug === undefined) {
      readFilesOne(fileNumbers)
    } else {
      for (let index = 0; index < fileNumbers.length; index += DETAIL_CHUNK_SIZE) {
        const chunkNumbers = fileNumbers.slice(index, index + DETAIL_CHUNK_SIZE)
        let chunkFiles
        try {
          chunkFiles = readFilesChunk({ root, gh, owner: slug.owner, name: slug.name, numbers: chunkNumbers })
        } catch {
          readFilesOne(chunkNumbers)
          continue
        }
        for (const number of chunkNumbers) {
          const paths = chunkFiles.get(number)
          if (paths === undefined || paths === null) readFilesOne([number])
          else filesFor.set(number, paths)
        }
      }
    }
    for (const item of pendingFiles) {
      const files = filesFor.get(item.number)
      if (files === undefined) continue
      if (activeChangeNames(files).length !== 1) { stopItem(item, 'active-changes'); continue }
      if (!checksGreen(item.row.statusCheckRollup)) { stopItem(item, 'ci'); continue }
      if (hasLabel(item.row, MERGEABLE_LABEL)) { stopItem(item, 'mergeable-label'); continue }
      if (item.entry === undefined) { stopItem(item, 'no-watch-state'); continue }
      if (String(item.entry.head ?? '') !== item.head) { stopItem(item, 'state-head'); continue }
      if (item.entry.status !== 'commented') { stopItem(item, 'state-status'); continue }
      detailNumbers.push({ number: item.number, row: item.row, entry: item.entry, files })
    }
  }

  const details = new Map()
  if (detailNumbers.length > 0) {
    const slug = repositorySlug(root)
    const readDetailOne = (number) => {
      try {
        details.set(number, readPullRequest({ root, number, gh }))
      } catch (readError) {
        errors.push({ number, error: readError instanceof Error ? readError.message : String(readError) })
      }
    }
    if (slug === undefined) {
      for (const item of detailNumbers) readDetailOne(item.number)
    }
    for (let index = 0; slug !== undefined && index < detailNumbers.length; index += DETAIL_CHUNK_SIZE) {
      const chunk = detailNumbers.slice(index, index + DETAIL_CHUNK_SIZE)
      const chunkNumbers = chunk.map((item) => item.number)
      let chunkDetails
      try {
        chunkDetails = readDetailChunk({ root, gh, owner: slug.owner, name: slug.name, numbers: chunkNumbers })
      } catch {
        for (const number of chunkNumbers) readDetailOne(number)
        continue
      }
      for (const number of chunkNumbers) {
        const value = chunkDetails.get(number)
        if (value === undefined) {
          readDetailOne(number)
          continue
        }
        details.set(number, value)
      }
    }
  }

  for (const item of detailNumbers) {
    const detail = details.get(item.number)
    if (detail === undefined) continue
    const head = String(item.entry.head ?? '')
    let comments = Array.isArray(detail.comments?.nodes ?? detail.comments)
      ? (detail.comments?.nodes ?? detail.comments)
      : []
    if (!hasTrustedMarker(comments, login, item.number, head)) {
      try {
        const text = gh(['pr', 'view', String(item.number), '--json', 'comments'], { cwd: root })
        if (text !== undefined) comments = JSON.parse(text)?.comments ?? comments
      } catch (error) {
        errors.push({ number: item.number, error: error instanceof Error ? error.message : String(error) })
        continue
      }
    }
    const pr = evidencePullRequest({
      row: item.row,
      entry: item.entry,
      detail: { ...detail, comments },
      files: item.files,
    })
    plans.set(item.number, decideOwnerReview({ pr, entry: item.entry, login, number: item.number }))
  }

  for (const number of ordered) {
    const decision = plans.get(number)
    if (decision === undefined) continue
    try {
      results.push(applyOwnerReviewDecision({ root, number, decision, apply, gh, now, state }))
    } catch (error) {
      errors.push({ number, error: error instanceof Error ? error.message : String(error) })
    }
  }
  results.sort((left, right) => left.number - right.number)
  errors.sort((left, right) => left.number - right.number)
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
    const label = parsed.command === 'reconcile'
      ? 'owner-review --reconcile'
      : `owner-review ${parsed.number}`
    const result = withRunTelemetry(root, label, () => withRunLock(root, () => (
      parsed.command === 'reconcile'
        ? reconcileOwnerReview({ root, apply: parsed.apply, gh })
        : syncPullRequest({ root, number: parsed.number, apply: parsed.apply, gh })
    )))
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
