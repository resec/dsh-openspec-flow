import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

import {
  decideOwnerReview,
  main,
  OWNER_REVIEW_LABEL,
  parseArgs,
  reconcileOwnerReview,
  syncPullRequest,
} from '../scripts/pr-review-owner-review.mjs'
import { loadState, saveState, cleanupClosedPullRequests } from '../scripts/pr-review-watch.mjs'

const HEAD = 'a'.repeat(40)
const OLD = 'b'.repeat(40)
const LOGIN = 'tester'

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'dsh-owner-review-'))
  const init = spawnSync('git', ['init', '-q', root], { encoding: 'utf8' })
  assert.equal(init.status, 0, init.stderr)
  mkdirSync(join(root, '.cache', 'pr-review'), { recursive: true })
  return root
}

function cleanup(...directories) {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true })
}

function passComment(head = HEAD) {
  return {
    author: { login: LOGIN },
    body: `**Verdict:** pass\n<!-- pr-review: pr=12 head=${head} round=1 -->`,
  }
}

function makePr(overrides = {}) {
  return {
    number: 12,
    state: 'OPEN',
    isDraft: false,
    headRefOid: HEAD,
    baseRefName: 'main',
    statusCheckRollup: [{ conclusion: 'SUCCESS' }],
    files: [{ path: 'openspec/changes/widget/proposal.md' }],
    labels: [],
    mergeable: 'MERGEABLE',
    mergeStateStatus: 'CLEAN',
    comments: [passComment()],
    ...overrides,
  }
}

function makeEntry(overrides = {}) {
  return {
    number: 12,
    head: HEAD,
    change: 'widget',
    status: 'commented',
    ...overrides,
  }
}

function writeState(root, entry = makeEntry(), ownerReview) {
  const state = { schemaVersion: 1, prs: { 12: entry } }
  if (ownerReview !== undefined) state.prs['12'].ownerReview = ownerReview
  saveState(root, state)
}

function fakeGh(handler) {
  const calls = []
  const gh = (args, options) => {
    calls.push(args)
    return handler(args, options)
  }
  return { gh, calls }
}

function prHandler(prs, list = []) {
  return (args) => {
    if (args[0] === 'api' && args[1] === 'user') return LOGIN
    if (args[0] === 'pr' && args[1] === 'view') {
      const value = prs[String(args[2])]
      if (value === undefined) throw new Error(`missing PR ${args[2]}`)
      return JSON.stringify(value)
    }
    if (args[0] === 'pr' && args[1] === 'edit') return 'ok'
    if (args[0] === 'pr' && args[1] === 'list') return JSON.stringify(list)
    throw new Error(`unexpected gh call: ${args.join(' ')}`)
  }
}

test('parseArgs accepts one PR, reconcile and help forms', () => {
  assert.deepEqual(parseArgs(['12']), { command: 'one', number: 12, apply: false, json: false })
  assert.deepEqual(parseArgs(['12', '--apply', '--json']), { command: 'one', number: 12, apply: true, json: true })
  assert.deepEqual(parseArgs(['--reconcile', '--apply']), { command: 'reconcile', number: undefined, apply: true, json: false })
  assert.equal(parseArgs(['--help']).command, 'help')
  assert.throws(() => parseArgs([]), /needs a PR number or --reconcile/)
  assert.throws(() => parseArgs(['0']), /positive integer/)
  assert.throws(() => parseArgs(['12', '--nope']), /unknown argument/)
  assert.throws(() => parseArgs(['--reconcile', '12']), /unexpected positional/)
})

test('decideOwnerReview covers add, keep, adopt, readd and remove', () => {
  const login = LOGIN
  assert.equal(decideOwnerReview({ pr: makePr(), entry: makeEntry(), login }).action, 'add')
  assert.equal(decideOwnerReview({
    pr: makePr({ labels: [{ name: OWNER_REVIEW_LABEL }] }),
    entry: makeEntry({ ownerReview: { head: HEAD, at: 't' } }),
    login,
  }).action, 'keep')
  assert.equal(decideOwnerReview({
    pr: makePr({ labels: [{ name: OWNER_REVIEW_LABEL }] }),
    entry: makeEntry(),
    login,
  }).action, 'adopt')
  assert.equal(decideOwnerReview({
    pr: makePr({ labels: [{ name: OWNER_REVIEW_LABEL }] }),
    entry: makeEntry({ ownerReview: { head: OLD, at: 't' } }),
    login,
  }).action, 'readd')
  assert.equal(decideOwnerReview({
    pr: makePr({ labels: [{ name: OWNER_REVIEW_LABEL }] }),
    entry: makeEntry({ ownerReview: { head: HEAD, at: 't' } }),
    login,
  }).action, 'keep')
  assert.equal(decideOwnerReview({
    pr: makePr({ labels: [{ name: OWNER_REVIEW_LABEL }], mergeable: 'MERGEABLE' }),
    entry: makeEntry({ ownerReview: { head: HEAD, at: 't' } }),
    login,
  }).action, 'keep')
  assert.equal(decideOwnerReview({
    pr: makePr({ labels: [{ name: OWNER_REVIEW_LABEL }, { name: 'mergeable' }] }),
    entry: makeEntry({ ownerReview: { head: HEAD, at: 't' } }),
    login,
  }).action, 'remove')
  assert.equal(decideOwnerReview({
    pr: makePr({ labels: [{ name: OWNER_REVIEW_LABEL }], mergeable: 'CONFLICTING' }),
    entry: makeEntry({ ownerReview: { head: HEAD, at: 't' } }),
    login,
  }).action, 'remove')
  assert.equal(decideOwnerReview({
    pr: makePr({ labels: [{ name: OWNER_REVIEW_LABEL }], mergeStateStatus: 'DIRTY' }),
    entry: makeEntry({ ownerReview: { head: HEAD, at: 't' } }),
    login,
  }).action, 'remove')
  assert.equal(decideOwnerReview({
    pr: makePr({ labels: [{ name: OWNER_REVIEW_LABEL }], mergeable: 'UNKNOWN' }),
    entry: makeEntry({ ownerReview: { head: HEAD, at: 't' } }),
    login,
  }).action, 'keep')
  assert.equal(decideOwnerReview({
    pr: makePr({ labels: [{ name: OWNER_REVIEW_LABEL }], mergeable: 'UNKNOWN' }),
    entry: makeEntry({ ownerReview: { head: OLD, at: 't' } }),
    login,
  }).action, 'remove')
  assert.equal(decideOwnerReview({
    pr: makePr({ labels: [{ name: OWNER_REVIEW_LABEL }], mergeable: 'UNKNOWN' }),
    entry: undefined,
    login,
  }).action, 'remove')
})

test('decideOwnerReview rejects untrusted, red, draft and multi-change states', () => {
  const login = LOGIN
  assert.equal(decideOwnerReview({
    pr: makePr({ comments: [{ ...passComment(), body: '**Verdict:** fail\n<!-- pr-review: pr=12 head=' + HEAD + ' round=1 -->' }] }),
    entry: makeEntry(),
    login,
  }).action, 'none')
  assert.equal(decideOwnerReview({ pr: makePr({ statusCheckRollup: [{ conclusion: 'FAILURE' }] }), entry: makeEntry(), login }).action, 'none')
  assert.equal(decideOwnerReview({ pr: makePr({ isDraft: true }), entry: makeEntry(), login }).action, 'none')
  assert.equal(decideOwnerReview({
    pr: makePr({ files: [{ path: 'openspec/changes/widget/a.md' }, { path: 'openspec/changes/other/a.md' }] }),
    entry: makeEntry(),
    login,
  }).action, 'none')
  assert.equal(decideOwnerReview({
    pr: makePr({ labels: [{ name: OWNER_REVIEW_LABEL }], comments: [] }),
    entry: makeEntry({ ownerReview: { head: HEAD, at: 't' } }),
    login,
  }).action, 'remove')
  assert.equal(decideOwnerReview({
    pr: makePr({ labels: [{ name: OWNER_REVIEW_LABEL }], statusCheckRollup: [{ conclusion: 'FAILURE' }] }),
    entry: makeEntry({ ownerReview: { head: HEAD, at: 't' } }),
    login,
  }).action, 'remove')
  assert.equal(decideOwnerReview({
    pr: makePr({ labels: [{ name: OWNER_REVIEW_LABEL }], mergeStateStatus: 'DIRTY' }),
    entry: makeEntry({ ownerReview: { head: HEAD, at: 't' } }),
    login,
  }).action, 'remove')
  assert.equal(decideOwnerReview({
    pr: makePr({ labels: [{ name: OWNER_REVIEW_LABEL }], state: 'CLOSED' }),
    entry: makeEntry({ ownerReview: { head: HEAD, at: 't' } }),
    login,
  }).action, 'remove')
  assert.equal(decideOwnerReview({
    pr: makePr({ labels: [{ name: OWNER_REVIEW_LABEL }] }),
    entry: makeEntry({ head: OLD, ownerReview: { head: OLD, at: 't' } }),
    login,
  }).action, 'remove')
})

test('syncPullRequest dry-run reports without writing labels or state', () => {
  const root = makeRoot()
  try {
    writeState(root)
    const { gh, calls } = fakeGh(prHandler({ 12: makePr() }))
    const result = syncPullRequest({ root, number: 12, gh })
    assert.equal(result.action, 'add')
    assert.equal(result.dryRun, true)
    assert.equal(calls.some((args) => args[1] === 'edit'), false)
    assert.equal(loadState(root).prs['12'].ownerReview, undefined)
  } finally {
    cleanup(root)
  }
})

test('syncPullRequest adds the label and records the head', () => {
  const root = makeRoot()
  try {
    writeState(root)
    const { gh, calls } = fakeGh(prHandler({ 12: makePr() }))
    const result = syncPullRequest({ root, number: 12, apply: true, gh, now: '2026-01-01T00:00:00.000Z' })
    assert.equal(result.action, 'add')
    assert.equal(calls.some((args) => args[2] === '12' && args[3] === '--add-label' && args[4] === OWNER_REVIEW_LABEL), true)
    assert.deepEqual(loadState(root).prs['12'].ownerReview, { head: HEAD, at: '2026-01-01T00:00:00.000Z' })
  } finally {
    cleanup(root)
  }
})

test('syncPullRequest removes on mergeable and clears state', () => {
  const root = makeRoot()
  try {
    writeState(root, makeEntry(), { head: HEAD, at: 't' })
    const { gh, calls } = fakeGh(prHandler({
      12: makePr({ labels: [{ name: OWNER_REVIEW_LABEL }, { name: 'mergeable' }] }),
    }))
    const result = syncPullRequest({ root, number: 12, apply: true, gh })
    assert.equal(result.action, 'remove')
    assert.equal(calls.some((args) => args[3] === '--remove-label' && args[4] === OWNER_REVIEW_LABEL), true)
    assert.equal(loadState(root).prs['12'].ownerReview, undefined)
  } finally {
    cleanup(root)
  }
})

test('syncPullRequest removes then adds for a new qualifying head', () => {
  const root = makeRoot()
  try {
    writeState(root, makeEntry(), { head: OLD, at: 'old' })
    const { gh, calls } = fakeGh(prHandler({ 12: makePr({ labels: [{ name: OWNER_REVIEW_LABEL }] }) }))
    const result = syncPullRequest({ root, number: 12, apply: true, gh, now: 'new' })
    assert.equal(result.action, 'readd')
    const edits = calls.filter((args) => args[1] === 'edit')
    assert.equal(edits.length, 2)
    assert.equal(edits[0][3], '--remove-label')
    assert.equal(edits[1][3], '--add-label')
    assert.deepEqual(loadState(root).prs['12'].ownerReview, { head: HEAD, at: 'new' })
  } finally {
    cleanup(root)
  }
})

test('syncPullRequest removes an orphan label even when mergeable is unknown', () => {
  const root = makeRoot()
  try {
    const { gh, calls } = fakeGh(prHandler({
      12: makePr({ labels: [{ name: OWNER_REVIEW_LABEL }], mergeable: 'UNKNOWN' }),
    }))
    const result = syncPullRequest({ root, number: 12, apply: true, gh })
    assert.equal(result.action, 'remove')
    assert.equal(calls.some((args) => args[3] === '--remove-label'), true)
  } finally {
    cleanup(root)
  }
})

test('syncPullRequest leaves state unchanged when the label write fails', () => {
  const root = makeRoot()
  try {
    writeState(root)
    const { gh } = fakeGh((args) => {
      if (args[0] === 'api') return LOGIN
      if (args[0] === 'pr' && args[1] === 'view') return JSON.stringify(makePr())
      if (args[0] === 'pr' && args[1] === 'edit') throw new Error('label denied')
      throw new Error('unexpected')
    })
    assert.throws(() => syncPullRequest({ root, number: 12, apply: true, gh }), /label denied/)
    assert.equal(loadState(root).prs['12'].ownerReview, undefined)
  } finally {
    cleanup(root)
  }
})

test('reconcileOwnerReview backfills and removes orphan labels', () => {
  const root = makeRoot()
  try {
    writeState(root)
    const list = [
      { number: 12, labels: [] },
      { number: 13, labels: [{ name: OWNER_REVIEW_LABEL }] },
    ]
    const { gh, calls } = fakeGh(prHandler({
      12: makePr(),
      13: makePr({ number: 13, labels: [{ name: OWNER_REVIEW_LABEL }] }),
    }, list))
    const result = reconcileOwnerReview({ root, apply: true, gh, now: 'now' })
    assert.equal(result.results.find((entry) => entry.number === 12).action, 'add')
    assert.equal(result.results.find((entry) => entry.number === 13).action, 'remove')
    assert.deepEqual(loadState(root).prs['12'].ownerReview, { head: HEAD, at: 'now' })
    assert.equal(calls.some((args) => args[2] === '13' && args[3] === '--remove-label'), true)
    assert.deepEqual(result.errors, [])
  } finally {
    cleanup(root)
  }
})

test('reconcileOwnerReview keeps a tracked unknown label and removes an orphan unknown label', () => {
  const root = makeRoot()
  try {
    writeState(root, makeEntry(), { head: HEAD, at: 't' })
    const list = [
      { number: 12, labels: [{ name: OWNER_REVIEW_LABEL }] },
      { number: 13, labels: [{ name: OWNER_REVIEW_LABEL }] },
    ]
    const { gh } = fakeGh(prHandler({
      12: makePr({ labels: [{ name: OWNER_REVIEW_LABEL }], mergeable: 'UNKNOWN' }),
      13: makePr({ number: 13, labels: [{ name: OWNER_REVIEW_LABEL }], mergeable: 'UNKNOWN' }),
    }, list))
    const result = reconcileOwnerReview({ root, apply: true, gh })
    assert.equal(result.results.find((entry) => entry.number === 12).action, 'keep')
    assert.equal(result.results.find((entry) => entry.number === 13).action, 'remove')
  } finally {
    cleanup(root)
  }
})

test('reconcileOwnerReview reports a label failure and continues', () => {
  const root = makeRoot()
  try {
    writeState(root)
    const list = [
      { number: 12, labels: [] },
      { number: 13, labels: [{ name: OWNER_REVIEW_LABEL }] },
    ]
    const { gh } = fakeGh((args) => {
      if (args[0] === 'api') return LOGIN
      if (args[0] === 'pr' && args[1] === 'list') return JSON.stringify(list)
      if (args[0] === 'pr' && args[1] === 'view') return JSON.stringify(makePr({ number: Number(args[2]) }))
      if (args[0] === 'pr' && args[1] === 'edit' && args[2] === '12') throw new Error('denied')
      if (args[0] === 'pr' && args[1] === 'edit') return 'ok'
      throw new Error('unexpected')
    })
    const result = reconcileOwnerReview({ root, apply: true, gh })
    assert.equal(result.errors.length, 1)
    assert.equal(result.errors[0].number, 12)
    assert.equal(result.results.some((entry) => entry.number === 13), true)
  } finally {
    cleanup(root)
  }
})

test('reconcile then per-PR add follows the scheduled label order', () => {
  const root = makeRoot()
  try {
    writeState(root)
    const { gh } = fakeGh(prHandler({ 12: makePr() }, [{ number: 12, labels: [] }]))
    const planned = reconcileOwnerReview({ root, gh })
    assert.equal(planned.results[0].action, 'add')
    assert.equal(loadState(root).prs['12'].ownerReview, undefined)
    const applied = syncPullRequest({ root, number: 12, apply: true, gh, now: 'scheduled' })
    assert.equal(applied.action, 'add')
    assert.deepEqual(loadState(root).prs['12'].ownerReview, { head: HEAD, at: 'scheduled' })
  } finally {
    cleanup(root)
  }
})

test('the scheduled cleanup then reconcile and per-PR add sequence runs in order', () => {
  const root = makeRoot()
  try {
    saveState(root, {
      schemaVersion: 1,
      prs: {
        12: makeEntry(),
        13: makeEntry({ number: 13, change: 'widget', worktree: join(root, '.cache', 'pr-review', 'worktrees', 'pr-13') }),
      },
    })
    const { gh } = fakeGh((args) => {
      if (args[0] === 'api') return LOGIN
      if (args[0] === 'pr' && args[1] === 'view' && args[2] === '13') return JSON.stringify({ state: 'CLOSED', mergedAt: null })
      if (args[0] === 'pr' && args[1] === 'view' && args[2] === '12') return JSON.stringify(makePr())
      if (args[0] === 'pr' && args[1] === 'list') return JSON.stringify([{ number: 12, labels: [] }])
      if (args[0] === 'pr' && args[1] === 'edit') return 'ok'
      throw new Error(`unexpected gh call: ${args.join(' ')}`)
    })
    const cleaned = cleanupClosedPullRequests({ root, gh })
    assert.equal(cleaned.length, 1)
    assert.equal(loadState(root).prs['13'], undefined)
    const reconciled = reconcileOwnerReview({ root, apply: true, gh, now: 'after-cleanup' })
    assert.equal(reconciled.results.some((entry) => entry.number === 12 && entry.action === 'add'), true)
    assert.deepEqual(loadState(root).prs['12'].ownerReview, { head: HEAD, at: 'after-cleanup' })
  } finally {
    cleanup(root)
  }
})

test('main dry-run prints a plan and the lock refuses a second run', () => {
  const root = makeRoot()
  try {
    writeState(root)
    const { gh, calls } = fakeGh(prHandler({ 12: makePr() }))
    let output = ''
    const code = main(['12'], (text) => { output += text }, { root, gh })
    assert.equal(code, 0)
    assert.match(output, /would add owner-review/)
    assert.equal(calls.some((args) => args[1] === 'edit'), false)

    mkdirSync(join(root, '.cache', 'pr-review', 'run.lock'), { recursive: true })
    output = ''
    const locked = main(['12'], (text) => { output += text }, { root, gh })
    assert.equal(locked, 1)
    assert.match(output, /another PR review run holds/)
    assert.equal(loadState(root).prs['12'].ownerReview, undefined)
  } finally {
    cleanup(root)
  }
})
