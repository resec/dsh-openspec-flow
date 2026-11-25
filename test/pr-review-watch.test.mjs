import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

import {
  acquireRunLock,
  activeChangeNames,
  checksGreen,
  cleanupClosedPullRequests,
  cleanupLocalEntries,
  filterCandidates,
  findLocalEntry,
  forgetPullRequest,
  hasTrustedMarker,
  loadLocalState,
  loadState,
  localPullRequestNumbers,
  main,
  mainWorktree,
  markFailed,
  parseArgs,
  pollPullRequests,
  pollText,
  preflight,
  preparePullRequest,
  processStartTime,
  publishComment,
  readPullRequestStates,
  readReport,
  reclaimStaleRunLock,
  releaseRunLock,
  renderReport,
  runLockOwner,
  resolvePaths,
  runLockAgeMs,
  saveLocalState,
  saveState,
  stateCommand,
  updateLocalEntry,
  withRunLock,
} from '../scripts/pr-review-watch.mjs'
import { acquireLock } from '../scripts/pr-review-lock.mjs'
import { ghRead } from '../scripts/gh-exec.mjs'
import { cleanupTempDirs, tempDir } from './temp.mjs'

test.after(cleanupTempDirs)

/** Wrap an injected gh double with the shared read retry policy. */
function retryingGh(handler) {
  return (args, options) => {
    let attempts = 0
    try {
      return handler(args, options)
    } catch (first) {
      attempts += 1
      if (attempts >= 1 && /HTTP 5\d\d|timed out/iu.test(String(first?.message ?? first))) {
        return handler(args, options)
      }
      throw first
    }
  }
}

const HEAD = 'a'.repeat(40)
const BASE = 'b'.repeat(40)

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

function makeRepository() {
  const directory = tempDir('dsh-pr-review-watch-')
  git(directory, ['init', '-q', '-b', 'main'])
  git(directory, ['config', 'user.email', 'test@example.com'])
  git(directory, ['config', 'user.name', 'Test'])
  const change = join(directory, 'openspec', 'changes', 'widget')
  mkdirSync(change, { recursive: true })
  writeFileSync(join(change, '.openspec.yaml'), 'schema: spec-driven\n')
  writeFileSync(join(change, 'proposal.md'), '# Widget\n')
  writeFileSync(join(directory, '.gitignore'), '.cache/\n')
  git(directory, ['add', '.'])
  git(directory, ['commit', '-qm', 'initial'])
  return directory
}

function makeOrigin(root) {
  const remote = tempDir('dsh-pr-review-remote-')
  git(remote, ['init', '--bare', '-q'])
  git(root, ['remote', 'add', 'origin', remote])
  git(root, ['push', '-q', '-u', 'origin', 'main'])
  return remote
}

/** Point origin at a GitHub URL so the batched state read resolves a repository. */
function useGithubOrigin(root) {
  git(root, ['remote', 'set-url', 'origin', 'https://github.com/owner/repo.git'])
}

function cleanup(...directories) {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true })
}

function fakeGh(handler) {
  const calls = []
  const gh = (args) => {
    calls.push(args)
    return handler(args)
  }
  return { gh, calls }
}

function prJson(overrides = {}) {
  return JSON.stringify({
    number: 12,
    state: 'OPEN',
    isDraft: false,
    headRefOid: HEAD,
    baseRefOid: BASE,
    baseRefName: 'main',
    statusCheckRollup: [{ conclusion: 'SUCCESS' }],
    files: [{ path: 'openspec/changes/widget/proposal.md' }],
    ...overrides,
  })
}

test('active change extraction and CI filtering are strict', () => {
  assert.deepEqual(
    activeChangeNames([
      { path: 'openspec/changes/widget/proposal.md' },
      { path: 'openspec/changes/other/tasks.md' },
      { path: 'openspec/changes/archive/old/proposal.md' },
    ]),
    ['widget', 'other'],
  )
  assert.equal(checksGreen([{ conclusion: 'SUCCESS' }, { state: 'SUCCESS' }]), true)
  assert.equal(checksGreen([{ conclusion: 'SUCCESS' }, { conclusion: null }]), false)
  assert.equal(checksGreen([{ conclusion: 'FAILURE' }]), false)
  assert.equal(checksGreen([]), false)
})

test('filterCandidates keeps only eligible PRs and skips processed heads', () => {
  const state = { schemaVersion: 1, prs: { 13: { head: HEAD, status: 'commented' } } }
  const candidates = filterCandidates([
    { number: 12, headRefOid: HEAD, baseRefOid: BASE, baseRefName: 'main', isDraft: false, statusCheckRollup: [{ conclusion: 'SUCCESS' }], files: [{ path: 'openspec/changes/widget/proposal.md' }] },
    { number: 13, headRefOid: HEAD, baseRefOid: BASE, baseRefName: 'main', isDraft: false, statusCheckRollup: [{ conclusion: 'SUCCESS' }], files: [{ path: 'openspec/changes/widget/proposal.md' }] },
    { number: 14, headRefOid: 'c'.repeat(40), baseRefOid: BASE, baseRefName: 'main', isDraft: true, statusCheckRollup: [{ conclusion: 'SUCCESS' }], files: [{ path: 'openspec/changes/widget/proposal.md' }] },
    { number: 15, headRefOid: 'd'.repeat(40), baseRefOid: BASE, baseRefName: 'main', isDraft: false, statusCheckRollup: [], files: [{ path: 'openspec/changes/widget/proposal.md' }] },
    { number: 16, headRefOid: 'e'.repeat(40), baseRefOid: BASE, baseRefName: 'main', isDraft: false, statusCheckRollup: [{ conclusion: 'SUCCESS' }], files: [{ path: 'openspec/changes/widget/proposal.md' }, { path: 'openspec/changes/other/tasks.md' }] },
  ], state)
  assert.deepEqual(candidates.map((candidate) => candidate.number), [12])
  assert.equal(candidates[0].change, 'widget')
})

test('checksGreen judges each check by its newest run', () => {
  const entry = (name, conclusion, startedAt, extra = {}) => ({ name, workflowName: 'ci', conclusion, startedAt, ...extra })
  const older = '2026-11-23T03:06:12Z'
  const newer = '2026-11-23T03:27:16Z'

  assert.equal(checksGreen([
    entry('verify', 'FAILURE', older),
    entry('lab', 'SUCCESS', older),
    entry('verify', 'SUCCESS', newer),
    entry('lab', 'SUCCESS', newer),
  ]), true)
  assert.equal(checksGreen([entry('verify', 'SUCCESS', older), entry('verify', 'FAILURE', newer)]), false)
  assert.equal(checksGreen([
    entry('verify', 'SUCCESS', older),
    entry('verify', null, newer, { status: 'IN_PROGRESS' }),
  ]), false)
  assert.equal(checksGreen([
    entry('verify', 'SUCCESS', older),
    entry('verify', 'SUCCESS', newer),
    entry('verify', 'FAILURE', newer),
  ]), false)
  assert.equal(checksGreen([
    entry('verify', 'SUCCESS', older),
    entry('verify', null, '0001-01-01T00:00:00Z', { status: 'QUEUED' }),
  ]), false)
  assert.equal(checksGreen([
    entry('verify', 'SUCCESS', older),
    entry('verify', 'FAILURE', older, { workflowName: 'nightly' }),
  ]), false)
  assert.equal(checksGreen([
    { context: 'ci/verify', state: 'FAILURE', createdAt: older },
    { context: 'ci/verify', state: 'SUCCESS', createdAt: newer },
  ]), true)
  assert.equal(checksGreen([
    { name: 'verify', conclusion: 'SUCCESS' },
    { name: 'verify', conclusion: 'FAILURE', startedAt: older },
  ]), false)
  assert.equal(checksGreen([
    { name: 'verify', conclusion: 'SUCCESS' },
    { name: 'verify', conclusion: 'SUCCESS', startedAt: newer },
  ]), true)
})

test('filterCandidates includes a head whose newer run replaced a failure', () => {
  const state = { schemaVersion: 1, prs: {} }
  const files = [{ path: 'openspec/changes/widget/proposal.md' }]
  const candidates = filterCandidates([
    {
      number: 17,
      headRefOid: HEAD,
      baseRefOid: BASE,
      baseRefName: 'main',
      isDraft: false,
      statusCheckRollup: [
        { name: 'verify', workflowName: 'ci', conclusion: 'FAILURE', startedAt: '2026-11-23T03:06:12Z' },
        { name: 'verify', workflowName: 'ci', conclusion: 'SUCCESS', startedAt: '2026-11-23T03:27:16Z' },
      ],
      files,
    },
    {
      number: 18,
      headRefOid: 'f'.repeat(40),
      baseRefOid: BASE,
      baseRefName: 'main',
      isDraft: false,
      statusCheckRollup: [
        { name: 'verify', workflowName: 'ci', conclusion: 'SUCCESS', startedAt: '2026-11-23T03:06:12Z' },
        { name: 'verify', workflowName: 'ci', conclusion: 'FAILURE', startedAt: '2026-11-23T03:27:16Z' },
      ],
      files,
    },
  ], state)
  assert.deepEqual(candidates.map((candidate) => candidate.number), [17])
})

test('parseArgs validates commands and the comment report flag', () => {
  assert.equal(parseArgs(['--help']).command, 'help')
  assert.deepEqual(parseArgs(['poll', '--json']), { command: 'poll', json: true, apply: false, cleanup: false, report: undefined, change: undefined, fail: undefined, error: undefined, number: undefined })
  assert.equal(parseArgs(['prepare', '12']).number, 12)
  assert.equal(parseArgs(['comment', '12', '--report', 'r.json', '--apply']).apply, true)
  assert.throws(() => parseArgs(['nope']), /unknown command/)
  assert.throws(() => parseArgs(['prepare']), /needs one PR number/)
  assert.equal(parseArgs(['comment', '12']).report, undefined)
})

test('prepare creates a detached worktree, reports the merge base and is idempotent', () => {
  const root = makeRepository()
  const remote = makeOrigin(root)
  try {
    git(root, ['checkout', '-qb', 'pr-head'])
    writeFileSync(join(root, 'openspec', 'changes', 'widget', 'design.md'), '# Design\n')
    git(root, ['add', '.'])
    git(root, ['commit', '-qm', 'PR head'])
    const head = git(root, ['rev-parse', 'HEAD'])
    git(root, ['push', '-q', 'origin', 'pr-head'])
    git(remote, ['update-ref', 'refs/pull/12/head', head])
    git(root, ['checkout', '-q', 'main'])
    const { gh } = fakeGh(() => prJson({ headRefOid: head }))
    const gitCalls = []
    const wrappedGit = (cwd, args, allowFailure) => {
      gitCalls.push(args)
      return git(cwd, args, allowFailure)
    }
    const facts = preparePullRequest({ root, number: 12, gh, git: wrappedGit })
    assert.equal(facts.head, head)
    assert.equal(gitCalls.some((args) => args[0] === 'worktree' && args[1] === 'add'), true)
    assert.equal(facts.change, 'widget')
    assert.equal(facts.base, git(root, ['rev-parse', 'main']))
    assert.equal(existsSync(join(facts.worktree, 'openspec', 'changes', 'widget', 'design.md')), true)
    assert.equal(loadState(root).prs['12'].head, head)
    const again = preparePullRequest({ root, number: 12, gh })
    assert.equal(again.worktree, facts.worktree)
    const status = spawnSync('git', ['-C', facts.worktree, 'status', '--porcelain'], { encoding: 'utf8' })
    assert.equal(status.stdout.trim(), '')
    assert.equal(git(root, ['status', '--porcelain']), '')
  } finally {
    cleanup(root, remote)
  }
})

test('prepare preserves the owner-review head when it records a new head', () => {
  const root = makeRepository()
  const remote = makeOrigin(root)
  try {
    git(root, ['checkout', '-qb', 'pr-head'])
    writeFileSync(join(root, 'openspec', 'changes', 'widget', 'design.md'), '# Design\n')
    git(root, ['add', '.'])
    git(root, ['commit', '-qm', 'PR head one'])
    const first = git(root, ['rev-parse', 'HEAD'])
    git(root, ['push', '-q', 'origin', 'pr-head'])
    git(remote, ['update-ref', 'refs/pull/12/head', first])
    git(root, ['checkout', '-q', 'main'])

    const { gh: firstGh } = fakeGh(() => prJson({ headRefOid: first }))
    preparePullRequest({ root, number: 12, gh: firstGh })
    const state = loadState(root)
    state.prs['12'].ownerReview = { head: first, at: 't' }
    saveState(root, state)

    git(root, ['checkout', '-q', 'pr-head'])
    writeFileSync(join(root, 'openspec', 'changes', 'widget', 'design.md'), '# Design two\n')
    git(root, ['add', '.'])
    git(root, ['commit', '-qm', 'PR head two'])
    const second = git(root, ['rev-parse', 'HEAD'])
    git(root, ['push', '-q', 'origin', 'pr-head'])
    git(remote, ['update-ref', 'refs/pull/12/head', second])
    git(root, ['checkout', '-q', 'main'])

    const { gh: secondGh } = fakeGh(() => prJson({ headRefOid: second }))
    preparePullRequest({ root, number: 12, gh: secondGh })
    const next = loadState(root).prs['12']
    assert.equal(next.head, second)
    assert.deepEqual(next.ownerReview, { head: first, at: 't' })
  } finally {
    cleanup(root, remote)
  }
})

test('renderReport carries the verdict, findings, verifications and marker', () => {
  const text = renderReport({
    verdict: 'changes-requested',
    summary: 'One blocking issue.',
    findings: [{ id: 'R1-01', severity: 'major', location: 'a.js:1', problem: 'bad', suggestion: 'fix' }],
    verifications: [],
    outOfScope: ['later'],
    residualRisks: ['risk'],
  }, { number: 12, head: HEAD, round: 2 })
  assert.match(text, /Apply review — PR #12, round 2/)
  assert.match(text, /\*\*Verdict:\*\* changes-requested/)
  assert.match(text, /R1-01/)
  assert.match(text, /pr-review: pr=12 head=a{40} round=2/)
})

test('readReport requires the PR/head file name and a matching head', () => {
  const root = tempDir('dsh-pr-review-report-')
  try {
    const file = join(root, `pr-12-${HEAD}.json`)
    writeFileSync(file, JSON.stringify({ verdict: 'pass', summary: 'ok', findings: [], verifications: [], head: HEAD }))
    assert.equal(readReport(file, 12, HEAD).verdict, 'pass')
    assert.throws(() => readReport(file, 13, HEAD), /must be named/)
    writeFileSync(file, JSON.stringify({ verdict: 'pass', summary: 'ok', findings: [], verifications: [], head: BASE }))
    assert.throws(() => readReport(file, 12, HEAD), /names head/)
    assert.throws(() => readReport(join(root, `pr-12-${HEAD}.json`), 12, HEAD), /names head/)
  } finally {
    cleanup(root)
  }
})

test('trusted markers require the authenticated author and exact head', () => {
  const comments = [{ author: { login: 'maintainer' }, body: `<!-- pr-review: pr=12 head=${HEAD} round=1 -->` }]
  assert.equal(hasTrustedMarker(comments, 'maintainer', 12, HEAD), true)
  assert.equal(hasTrustedMarker(comments, 'someone', 12, HEAD), false)
  assert.equal(hasTrustedMarker(comments, 'maintainer', 12, BASE), false)
})

test('comment dry-run renders without a GitHub write, and --apply posts once', () => {
  const root = makeRepository()
  try {
    saveState(root, { schemaVersion: 1, prs: { 12: { number: 12, head: HEAD, base: BASE, change: 'widget', round: 0, status: 'prepared' } } })
    const report = join(root, '.cache', 'pr-review', 'reports', `pr-12-${HEAD}.json`)
    mkdirSync(dirname(report), { recursive: true })
    writeFileSync(report, JSON.stringify({ verdict: 'pass', summary: 'ok', findings: [], verifications: [] }))
    const { gh, calls } = fakeGh((args) => {
      if (args[0] === 'api') return 'maintainer'
      if (args[0] === 'pr' && args[1] === 'view') return JSON.stringify({ comments: [] })
      if (args[0] === 'pr' && args[1] === 'comment') return 'https://example.test/comment/1'
      return undefined
    })
    const dry = publishComment({ root, number: 12, reportPath: report, gh })
    assert.equal(dry.published, false)
    assert.equal(dry.dryRun, true)
    assert.match(dry.text, /Apply review/)
    assert.equal(calls.some((args) => args[0] === 'pr' && args[1] === 'comment'), false)
    const posted = publishComment({ root, number: 12, reportPath: report, apply: true, gh, ghWrite: gh })
    assert.equal(posted.published, true)
    assert.equal(calls.filter((args) => args[0] === 'pr' && args[1] === 'comment').length, 1)
    assert.equal(loadState(root).prs['12'].status, 'commented')
  } finally {
    cleanup(root)
  }
})

test('a trusted marker for the same head suppresses a second publish', () => {
  const root = makeRepository()
  try {
    saveState(root, { schemaVersion: 1, prs: { 12: { number: 12, head: HEAD, base: BASE, change: 'widget', round: 0, status: 'prepared' } } })
    const report = join(root, '.cache', 'pr-review', 'reports', `pr-12-${HEAD}.json`)
    mkdirSync(dirname(report), { recursive: true })
    writeFileSync(report, JSON.stringify({ verdict: 'pass', summary: 'ok', findings: [], verifications: [] }))
    const { gh, calls } = fakeGh((args) => {
      if (args[0] === 'api') return 'maintainer'
      if (args[0] === 'pr' && args[1] === 'view') {
        return JSON.stringify({ comments: [{ author: { login: 'maintainer' }, body: `<!-- pr-review: pr=12 head=${HEAD} round=1 -->` }] })
      }
      return undefined
    })
    const result = publishComment({ root, number: 12, reportPath: report, apply: true, gh, ghWrite: gh })
    assert.equal(result.already, true)
    assert.equal(calls.some((args) => args[0] === 'pr' && args[1] === 'comment'), false)
  } finally {
    cleanup(root)
  }
})

test('run lock rejects a second concurrent run', () => {
  const root = makeRepository()
  try {
    const value = withRunLock(root, () => {
      assert.throws(() => withRunLock(root, () => 'inner'), /another PR review run holds/)
      return 'outer'
    })
    assert.equal(value, 'outer')
  } finally {
    cleanup(root)
  }
})

test('forget removes the checkout, matching apply state and tracked entry', () => {
  const root = makeRepository()
  const remote = makeOrigin(root)
  try {
    git(root, ['checkout', '-qb', 'pr-head'])
    git(root, ['commit', '--allow-empty', '-qm', 'PR head'])
    const head = git(root, ['rev-parse', 'HEAD'])
    git(root, ['push', '-q', 'origin', 'pr-head'])
    git(remote, ['update-ref', 'refs/pull/12/head', head])
    git(root, ['checkout', '-q', 'main'])
    const { gh } = fakeGh(() => prJson({ headRefOid: head }))
    const facts = preparePullRequest({ root, number: 12, gh })
    const common = git(root, ['rev-parse', '--path-format=absolute', '--git-common-dir'])
    const applyDir = join(common, 'openspec-flow', 'apply')
    mkdirSync(applyDir, { recursive: true })
    const applyFile = join(applyDir, 'local#widget.json')
    writeFileSync(applyFile, JSON.stringify({ change: 'widget', worktree: facts.worktree }))
    const result = forgetPullRequest({ root, number: 12, change: 'widget', worktree: facts.worktree })
    assert.equal(result.applyState, applyFile)
    assert.equal(existsSync(facts.worktree), false)
    assert.equal(existsSync(applyFile), false)
    assert.equal(loadState(root).prs['12'], undefined)
  } finally {
    cleanup(root, remote)
  }
})

test('cleanup removes a tracked merged PR checkout and state entry', () => {
  const root = makeRepository()
  const remote = makeOrigin(root)
  try {
    git(root, ['checkout', '-qb', 'pr-head'])
    git(root, ['commit', '--allow-empty', '-qm', 'PR head'])
    const head = git(root, ['rev-parse', 'HEAD'])
    git(root, ['push', '-q', 'origin', 'pr-head'])
    git(remote, ['update-ref', 'refs/pull/12/head', head])
    git(root, ['checkout', '-q', 'main'])
    const { gh } = fakeGh(() => prJson({ headRefOid: head }))
    const facts = preparePullRequest({ root, number: 12, gh })
    useGithubOrigin(root)
    const cleanupGh = fakeGh((args) => {
      if (args[0] === 'api' && args[1] === 'graphql') {
        return JSON.stringify({ data: { repository: { p12: { state: 'MERGED' } } } })
      }
      throw new Error(`cleanup made an unexpected gh call: ${args.join(' ')}`)
    }).gh
    const cleaned = cleanupClosedPullRequests({ root, gh: cleanupGh })
    assert.equal(cleaned.length, 1)
    assert.equal(existsSync(facts.worktree), false)
    assert.equal(loadState(root).prs['12'], undefined)
    const state = stateCommand({ root })
    assert.deepEqual(state.prs, {})
  } finally {
    cleanup(root, remote)
  }
})

test('poll, prepare, publish and re-prepare after a new head', () => {
  const root = makeRepository()
  const remote = makeOrigin(root)
  try {
    git(root, ['checkout', '-qb', 'pr-head'])
    git(root, ['commit', '--allow-empty', '-qm', 'PR head'])
    let head = git(root, ['rev-parse', 'HEAD'])
    git(root, ['push', '-q', 'origin', 'pr-head'])
    git(remote, ['update-ref', 'refs/pull/12/head', head])
    git(root, ['checkout', '-q', 'main'])
    const comments = []
    const calls = []
    const gh = (args) => {
      calls.push(args)
      if (args[0] === 'pr' && args[1] === 'list') {
        return JSON.stringify([{ number: 12, headRefOid: head, baseRefOid: BASE, baseRefName: 'main', isDraft: false, statusCheckRollup: [{ conclusion: 'SUCCESS' }], files: [{ path: 'openspec/changes/widget/proposal.md' }] }])
      }
      if (args[0] === 'pr' && args[1] === 'view' && args[2] === '12' && args.includes('comments')) {
        return JSON.stringify({ comments })
      }
      if (args[0] === 'pr' && args[1] === 'view' && args[2] === '12') {
        return prJson({ headRefOid: head })
      }
      if (args[0] === 'api') return 'maintainer'
      if (args[0] === 'pr' && args[1] === 'comment') return 'https://example.test/comment'
      throw new Error(`unexpected gh call ${args.join(' ')}`)
    }
    assert.equal(pollPullRequests({ root, gh }).candidates.length, 1)
    const first = preparePullRequest({ root, number: 12, gh })
    const report = (path, round) => {
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, JSON.stringify({ verdict: 'pass', summary: 'ok', findings: [], verifications: [], round }))
      return path
    }
    const firstReport = report(join(root, '.cache', 'pr-review', 'reports', `pr-12-${head}.json`), 1)
    assert.equal(publishComment({ root, number: 12, reportPath: firstReport, gh }).dryRun, true)
    assert.equal(publishComment({ root, number: 12, reportPath: firstReport, apply: true, gh, ghWrite: gh }).published, true)
    comments.push({ author: { login: 'maintainer' }, body: `<!-- pr-review: pr=12 head=${head} round=1 -->` })

    git(root, ['checkout', '-q', 'pr-head'])
    git(root, ['commit', '--allow-empty', '-qm', 'second head'])
    head = git(root, ['rev-parse', 'HEAD'])
    git(root, ['push', '-q', 'origin', 'pr-head'])
    git(remote, ['update-ref', 'refs/pull/12/head', head])
    git(root, ['checkout', '-q', 'main'])
    const second = preparePullRequest({ root, number: 12, gh })
    assert.notEqual(second.head, first.head)
    const secondReport = report(join(root, '.cache', 'pr-review', 'reports', `pr-12-${head}.json`), 2)
    assert.equal(publishComment({ root, number: 12, reportPath: secondReport, apply: true, gh, ghWrite: gh }).published, true)
    assert.equal(calls.filter((args) => args[0] === 'pr' && args[1] === 'comment').length, 2)
  } finally {
    cleanup(root, remote)
  }
})

test('prepared and failed heads are re-emitted while commented heads are skipped', () => {
  const state = {
    schemaVersion: 1,
    prs: {
      12: { head: HEAD, status: 'prepared', change: 'widget', base: BASE, worktree: '/tmp/widget' },
      13: { head: HEAD, status: 'commented', change: 'widget' },
      14: { head: HEAD, status: 'failed', change: 'widget', base: BASE, worktree: '/tmp/widget-14' },
    },
  }
  const candidates = filterCandidates([
    { number: 12, headRefOid: HEAD, baseRefOid: BASE, baseRefName: 'main', isDraft: false, statusCheckRollup: [{ conclusion: 'SUCCESS' }], files: [{ path: 'openspec/changes/widget/proposal.md' }] },
    { number: 13, headRefOid: HEAD, baseRefOid: BASE, baseRefName: 'main', isDraft: false, statusCheckRollup: [{ conclusion: 'SUCCESS' }], files: [{ path: 'openspec/changes/widget/proposal.md' }] },
    { number: 14, headRefOid: HEAD, baseRefOid: BASE, baseRefName: 'main', isDraft: false, statusCheckRollup: [{ conclusion: 'SUCCESS' }], files: [{ path: 'openspec/changes/widget/proposal.md' }] },
  ], state)
  assert.deepEqual(candidates.map((candidate) => candidate.number), [12, 14])
  assert.equal(candidates[0].resume, true)
  assert.equal(candidates[0].worktree, '/tmp/widget')
})

test('state loading, missing reports and empty polls fail or return explicitly', () => {
  const root = makeRepository()
  try {
    const stateFile = join(root, '.cache', 'pr-review', 'state.json')
    mkdirSync(dirname(stateFile), { recursive: true })
    writeFileSync(stateFile, '{not json')
    assert.throws(() => loadState(root), /not JSON|corrupt/)
    rmSync(stateFile)
    const { gh } = fakeGh(() => '[]')
    assert.deepEqual(pollPullRequests({ root, gh }).candidates, [])
    assert.throws(() => readReport(join(root, 'missing.json'), 12, HEAD), /does not exist/)
  } finally {
    cleanup(root)
  }
})

test('prepare refuses a dirty worktree and a head that moved before the fetch', () => {
  const root = makeRepository()
  const remote = makeOrigin(root)
  try {
    git(root, ['checkout', '-qb', 'pr-head'])
    git(root, ['commit', '--allow-empty', '-qm', 'PR head'])
    let head = git(root, ['rev-parse', 'HEAD'])
    git(root, ['push', '-q', 'origin', 'pr-head'])
    git(remote, ['update-ref', 'refs/pull/12/head', head])
    git(root, ['checkout', '-q', 'main'])
    const { gh } = fakeGh(() => prJson({ headRefOid: head }))
    const facts = preparePullRequest({ root, number: 12, gh })
    writeFileSync(join(facts.worktree, 'dirty.txt'), 'dirty')
    assert.throws(() => preparePullRequest({ root, number: 12, gh }), /not clean/)
    rmSync(join(facts.worktree, 'dirty.txt'))
    git(root, ['checkout', '-q', 'pr-head'])
    git(root, ['commit', '--allow-empty', '-qm', 'moved'])
    const moved = git(root, ['rev-parse', 'HEAD'])
    git(root, ['push', '-q', 'origin', 'pr-head'])
    git(remote, ['update-ref', 'refs/pull/12/head', moved])
    git(root, ['checkout', '-q', 'main'])
    assert.throws(() => preparePullRequest({ root, number: 12, gh }), /moved/)
  } finally {
    cleanup(root, remote)
  }
})

test('prepare uses the fork point after the base branch advances', () => {
  const root = makeRepository()
  const remote = makeOrigin(root)
  try {
    const fork = git(root, ['rev-parse', 'main'])
    git(root, ['checkout', '-qb', 'pr-head'])
    git(root, ['commit', '--allow-empty', '-qm', 'PR head'])
    const head = git(root, ['rev-parse', 'HEAD'])
    git(root, ['push', '-q', 'origin', 'pr-head'])
    git(remote, ['update-ref', 'refs/pull/12/head', head])
    git(root, ['checkout', '-q', 'main'])
    git(root, ['commit', '--allow-empty', '-qm', 'base advances'])
    const advanced = git(root, ['rev-parse', 'main'])
    git(root, ['push', '-q', 'origin', 'main'])
    const { gh } = fakeGh(() => prJson({ headRefOid: head }))
    const facts = preparePullRequest({ root, number: 12, gh })
    assert.equal(facts.base, fork)
    assert.notEqual(facts.base, advanced)
  } finally {
    cleanup(root, remote)
  }
})

test('a failed publish records the failure and keeps the head eligible', () => {
  const root = makeRepository()
  try {
    saveState(root, { schemaVersion: 1, prs: { 12: { number: 12, head: HEAD, base: BASE, change: 'widget', round: 0, status: 'prepared' } } })
    const report = join(root, '.cache', 'pr-review', 'reports', `pr-12-${HEAD}.json`)
    mkdirSync(dirname(report), { recursive: true })
    writeFileSync(report, JSON.stringify({ verdict: 'pass', summary: 'ok', findings: [], verifications: [] }))
    const { gh } = fakeGh((args) => {
      if (args[0] === 'api') return 'maintainer'
      if (args[0] === 'pr' && args[1] === 'view') return JSON.stringify({ comments: [] })
      if (args[0] === 'pr' && args[1] === 'comment') return undefined
      return undefined
    })
    assert.throws(() => publishComment({ root, number: 12, reportPath: report, apply: true, gh, ghWrite: gh }), /pr comment/)
    assert.equal(loadState(root).prs['12'].status, 'failed')
    const candidates = filterCandidates([{ number: 12, headRefOid: HEAD, baseRefOid: BASE, baseRefName: 'main', isDraft: false, statusCheckRollup: [{ conclusion: 'SUCCESS' }], files: [{ path: 'openspec/changes/widget/proposal.md' }] }], loadState(root))
    assert.equal(candidates.length, 1)
    assert.equal(candidates[0].resume, true)
  } finally {
    cleanup(root)
  }
})

test('forget refuses an apply state that names a different worktree', () => {
  const root = makeRepository()
  try {
    saveState(root, { schemaVersion: 1, prs: { 12: { number: 12, head: HEAD, base: BASE, change: 'widget', worktree: '/tmp/pr-12', round: 0, status: 'prepared' } } })
    const common = git(root, ['rev-parse', '--path-format=absolute', '--git-common-dir'])
    const applyDir = join(common, 'openspec-flow', 'apply')
    mkdirSync(applyDir, { recursive: true })
    const applyFile = join(applyDir, 'local#widget.json')
    writeFileSync(applyFile, JSON.stringify({ change: 'widget', worktree: '/tmp/other' }))
    assert.throws(() => forgetPullRequest({ root, number: 12, change: 'widget', worktree: '/tmp/pr-12' }), /names/)
    assert.equal(existsSync(applyFile), true)
  } finally {
    cleanup(root)
  }
})

test('a failed review is recorded and re-emitted by the poll', () => {
  const root = makeRepository()
  try {
    saveState(root, { schemaVersion: 1, prs: { 12: { number: 12, head: HEAD, base: BASE, change: 'widget', worktree: '/tmp/pr-12', round: 0, status: 'prepared' } } })
    const failed = markFailed({ root, number: 12, error: 'reviewer timed out' })
    assert.equal(failed.status, 'failed')
    assert.equal(failed.error, 'reviewer timed out')
    const candidates = filterCandidates([{ number: 12, headRefOid: HEAD, baseRefOid: BASE, baseRefName: 'main', isDraft: false, statusCheckRollup: [{ conclusion: 'SUCCESS' }], files: [{ path: 'openspec/changes/widget/proposal.md' }] }], loadState(root))
    assert.equal(candidates.length, 1)
    assert.equal(candidates[0].resume, true)
    assert.equal(parseArgs(['state', '--fail', '12', '--error', 'x']).fail, '12')
  } finally {
    cleanup(root)
  }
})

test('prepare reports the git failure when worktree creation fails', () => {
  const root = makeRepository()
  const remote = makeOrigin(root)
  try {
    git(root, ['checkout', '-qb', 'pr-head'])
    git(root, ['commit', '--allow-empty', '-qm', 'PR head'])
    const head = git(root, ['rev-parse', 'HEAD'])
    git(root, ['push', '-q', 'origin', 'pr-head'])
    git(remote, ['update-ref', 'refs/pull/12/head', head])
    git(root, ['checkout', '-q', 'main'])
    const { gh } = fakeGh(() => prJson({ headRefOid: head }))
    const failingGit = (cwd, args) => {
      if (args[0] === 'worktree' && args[1] === 'add') throw new Error('fatal: already registered')
      return git(cwd, args)
    }
    assert.throws(() => preparePullRequest({ root, number: 12, gh, git: failingGit }), /cannot create.*already registered/)
  } finally {
    cleanup(root, remote)
  }
})

test('prepare refuses a PR head without the change and a checkout outside the worktree', () => {
  const root = makeRepository()
  const remote = makeOrigin(root)
  try {
    git(root, ['checkout', '-qb', 'pr-head'])
    git(root, ['rm', '-rq', 'openspec/changes/widget'])
    git(root, ['commit', '-qm', 'drop the change'])
    const head = git(root, ['rev-parse', 'HEAD'])
    git(root, ['push', '-q', 'origin', 'pr-head'])
    git(remote, ['update-ref', 'refs/pull/12/head', head])
    git(root, ['checkout', '-q', 'main'])
    const { gh } = fakeGh(() => prJson({ headRefOid: head }))
    assert.throws(() => preparePullRequest({ root, number: 12, gh }), /does not contain the change/)
  } finally {
    cleanup(root, remote)
  }
})

test('prepare refuses a worktree whose top level is not the expected checkout', () => {
  const root = makeRepository()
  const remote = makeOrigin(root)
  try {
    git(root, ['checkout', '-qb', 'pr-head'])
    git(root, ['commit', '--allow-empty', '-qm', 'PR head'])
    const head = git(root, ['rev-parse', 'HEAD'])
    git(root, ['push', '-q', 'origin', 'pr-head'])
    git(remote, ['update-ref', 'refs/pull/12/head', head])
    git(root, ['checkout', '-q', 'main'])
    const { gh } = fakeGh(() => prJson({ headRefOid: head }))
    const fakeGit = (cwd, args) => {
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel' && String(cwd).includes('pr-12')) return '/tmp/not-the-pr-worktree'
      return git(cwd, args)
    }
    assert.throws(() => preparePullRequest({ root, number: 12, gh, git: fakeGit }), /does not resolve to itself/)
  } finally {
    cleanup(root, remote)
  }
})

test('prepare refuses a worktree with a foreign git common directory', () => {
  const root = makeRepository()
  const remote = makeOrigin(root)
  try {
    git(root, ['checkout', '-qb', 'pr-head'])
    git(root, ['commit', '--allow-empty', '-qm', 'PR head'])
    const head = git(root, ['rev-parse', 'HEAD'])
    git(root, ['push', '-q', 'origin', 'pr-head'])
    git(remote, ['update-ref', 'refs/pull/12/head', head])
    git(root, ['checkout', '-q', 'main'])
    const { gh } = fakeGh(() => prJson({ headRefOid: head }))
    const fakeGit = (cwd, args) => {
      if (args[0] === 'rev-parse' && args[1] === '--path-format=absolute' && args[2] === '--git-common-dir' && String(cwd).includes('pr-12')) return '/tmp/foreign-git'
      return git(cwd, args)
    }
    assert.throws(() => preparePullRequest({ root, number: 12, gh, git: fakeGit }), /does not share/)
  } finally {
    cleanup(root, remote)
  }
})

test('the CLI help and usage errors use the documented exit codes', () => {
  let output = ''
  assert.equal(main(['--help'], (text) => { output += text }), 0)
  assert.match(output, /usage: node scripts\/pr-review-watch.mjs/)
  output = ''
  assert.equal(main(['bogus'], (text) => { output += text }), 2)
  assert.match(output, /unknown command/)
})


function localEntry(overrides = {}) {
  return {
    number: 12,
    change: 'widget',
    branch: 'openspec/apply/local-widget-12345678',
    head: HEAD,
    tree: BASE,
    record: 'local#widget',
    ownerSession: 'owner-1',
    phase: 'published',
    ...overrides,
  }
}

function saveLocalEntries(root, entries) {
  saveLocalState(root, { schemaVersion: 1, prs: entries })
}

test('the local owner state round-trips every field and refuses a corrupt file', () => {
  const root = makeRepository()
  try {
    const entry = localEntry()
    saveLocalEntries(root, { 12: entry })
    const loaded = loadLocalState(root)
    assert.deepEqual(loaded.prs['12'], entry)
    assert.deepEqual([...localPullRequestNumbers(root)], ['12'])
    assert.equal(findLocalEntry(root, { change: 'widget' }).number, 12)
    assert.equal(findLocalEntry(root, { change: 'widget', branch: entry.branch }).number, 12)
    assert.equal(findLocalEntry(root, { change: 'other' }), undefined)
    const updated = updateLocalEntry(root, 12, { phase: 'merged' })
    assert.equal(updated.phase, 'merged')
    assert.equal(typeof updated.updatedAt, 'string')
    const file = resolvePaths(root).localState
    writeFileSync(file, '{not json')
    assert.throws(() => loadLocalState(root), /corrupt/)
    writeFileSync(file, JSON.stringify({ schemaVersion: 1, prs: { 12: localEntry({ phase: 'unknown' }) } }))
    assert.throws(() => loadLocalState(root), /invalid phase/)
    for (const field of ['change', 'branch', 'head', 'tree', 'record', 'ownerSession']) {
      writeFileSync(file, JSON.stringify({ schemaVersion: 1, prs: { 12: localEntry({ [field]: '' }) } }))
      assert.throws(() => loadLocalState(root), new RegExp(`invalid ${field}`))
    }
    writeFileSync(file, JSON.stringify({ schemaVersion: 1, prs: { 12: localEntry({ number: 0 }) } }))
    assert.throws(() => loadLocalState(root), /invalid number/)
    writeFileSync(file, JSON.stringify({ schemaVersion: 2, prs: {} }))
    assert.throws(() => loadLocalState(root), /corrupt/)
  } finally {
    cleanup(root)
  }
})

test('the local owner state resolves against the main worktree from a linked checkout', () => {
  const root = makeRepository()
  const linked = tempDir('dsh-pr-review-linked-')
  try {
    git(root, ['worktree', 'add', '-q', '--detach', linked, 'HEAD'])
    assert.equal(mainWorktree(linked), root)
    saveLocalEntries(root, { 12: localEntry() })
    const main = mainWorktree(linked)
    assert.deepEqual([...localPullRequestNumbers(main)], ['12'])
    assert.equal(findLocalEntry(main, { change: 'widget' }).ownerSession, 'owner-1')
    assert.equal(existsSync(join(linked, '.cache', 'pr-review', 'local-prs.json')), false)
  } finally {
    cleanup(root, linked)
  }
})

test('poll, prepare and comment exclude a local pull request and refuse corrupt state', () => {
  const root = makeRepository()
  try {
    saveState(root, { schemaVersion: 1, prs: {} })
    saveLocalEntries(root, { 12: localEntry() })
    const list = JSON.stringify([{
      number: 12,
      headRefOid: HEAD,
      baseRefOid: BASE,
      baseRefName: 'main',
      isDraft: false,
      statusCheckRollup: [{ conclusion: 'SUCCESS' }],
      files: [{ path: 'openspec/changes/widget/proposal.md' }],
    }])
    const { gh } = fakeGh(() => list)
    const poll = pollPullRequests({ root, gh })
    assert.deepEqual(poll.candidates, [])
    assert.deepEqual(poll.ownerManaged, [12])
    assert.throws(() => preparePullRequest({ root, number: 12, gh }), /owner-managed locally/)
    assert.throws(
      () => publishComment({ root, number: 12, reportPath: join(root, 'report.json') }),
      /owner-managed locally/,
    )
    const place = join(resolvePaths(root).reports, `pr-12-${HEAD}.json`)
    mkdirSync(dirname(place), { recursive: true })
    writeFileSync(place, JSON.stringify({ verdict: 'pass', summary: 'ok', findings: [], verifications: [] }))
    assert.throws(() => publishComment({ root, number: 12, reportPath: place }), /owner-managed locally/)

    saveLocalState(root, { schemaVersion: 1, prs: { 12: localEntry({ phase: 'bogus' }) } })
    assert.throws(() => pollPullRequests({ root, gh }), /corrupt|invalid phase/)
    assert.throws(() => preparePullRequest({ root, number: 12, gh }), /corrupt|invalid phase/)
    assert.throws(() => publishComment({ root, number: 12, reportPath: place }), /corrupt|invalid phase/)
  } finally {
    cleanup(root)
  }
})

test('local cleanup removes only closed unlanded or pushed entries and retains the rest', () => {
  const root = makeRepository()
  try {
    saveLocalEntries(root, {
      12: localEntry({ number: 12, phase: 'merged' }),
      13: localEntry({ number: 13, phase: 'pushed' }),
      14: localEntry({ number: 14, phase: 'landed' }),
      15: localEntry({ number: 15, phase: 'failed' }),
      16: localEntry({ number: 16, phase: 'published' }),
    })
    const states = { 12: 'MERGED', 13: 'OPEN', 14: 'MERGED', 15: 'CLOSED', 16: 'CLOSED' }
    const gh = (args) => JSON.stringify({ state: states[args[2]] })
    const result = cleanupLocalEntries({ root, gh })
    assert.deepEqual(result.removed.map((entry) => entry.number), [13, 15, 16])
    assert.deepEqual(result.removed.map((entry) => entry.local), [true, true, true])
    assert.deepEqual(result.retained.map((entry) => entry.number).sort(), [12, 14])
    assert.equal(result.retained.find((entry) => entry.number === 14).phase, 'landed')
    assert.deepEqual(Object.keys(loadLocalState(root).prs).sort(), ['12', '14'])
  } finally {
    cleanup(root)
  }
})

test('state cleanup reports a retained unfinished local entry', () => {
  const root = makeRepository()
  const remote = makeOrigin(root)
  try {
    saveLocalEntries(root, {
      12: localEntry({ number: 12, phase: 'landed-offline' }),
      13: localEntry({ number: 13, phase: 'pushed' }),
    })
    const gh = (args) => {
      if (args[0] === 'pr' && args[1] === 'view') {
        const number = Number(args[2])
        return JSON.stringify({ state: number === 12 ? 'MERGED' : 'OPEN' })
      }
      return '[]'
    }
    const cleaned = cleanupClosedPullRequests({ root, gh })
    assert.deepEqual(cleaned.map((entry) => entry.number), [13, 12])
    assert.equal(cleaned.find((entry) => entry.number === 12).retained, true)
    assert.equal(cleaned.find((entry) => entry.number === 12).phase, 'landed-offline')
    assert.deepEqual(Object.keys(loadLocalState(root).prs), ['12'])
  } finally {
    cleanup(root, remote)
  }
})

test('the state read batches numbers within one request', () => {
  const root = makeRepository()
  const remote = makeOrigin(root)
  try {
    useGithubOrigin(root)
    const answer = (args) => {
      const query = String(args[3]).replace(/^query=/u, '')
      const numbers = [...query.matchAll(/p(\d+):pullRequest/gu)].map((match) => Number(match[1]))
      const repository = Object.fromEntries(numbers.map((number) => [`p${number}`, { state: 'OPEN' }]))
      return JSON.stringify({ data: { repository } })
    }
    const once = fakeGh(answer)
    const states = readPullRequestStates({
      root,
      numbers: Array.from({ length: 88 }, (_, index) => index + 1),
      gh: once.gh,
    })
    assert.equal(once.calls.length, 1)
    assert.equal(states.size, 88)
    assert.equal(states.get(88), 'OPEN')

    const twice = fakeGh(answer)
    const all = readPullRequestStates({
      root,
      numbers: Array.from({ length: 101 }, (_, index) => index + 1),
      gh: twice.gh,
    })
    assert.equal(twice.calls.length, 2)
    assert.equal(all.size, 101)
  } finally {
    cleanup(root, remote)
  }
})

test('a number the batch leaves out is read on its own', () => {
  const root = makeRepository()
  const remote = makeOrigin(root)
  try {
    useGithubOrigin(root)
    const fake = fakeGh((args) => {
      if (args[0] === 'api') return JSON.stringify({ data: { repository: { p7: null, p8: { state: 'OPEN' } } } })
      return JSON.stringify({ state: 'MERGED' })
    })
    const states = readPullRequestStates({ root, numbers: [7, 8], gh: fake.gh })
    assert.equal(states.get(7), 'MERGED')
    assert.equal(states.get(8), 'OPEN')
    assert.deepEqual(fake.calls.map((args) => args.slice(0, 3)), [['api', 'graphql', '-f'], ['pr', 'view', '7']])
  } finally {
    cleanup(root, remote)
  }
})

test('a failed individual read fails the state read', () => {
  const root = makeRepository()
  const remote = makeOrigin(root)
  try {
    useGithubOrigin(root)
    const fake = fakeGh((args) => (args[0] === 'api'
      ? JSON.stringify({ data: { repository: { p7: null } } })
      : undefined))
    assert.throws(() => readPullRequestStates({ root, numbers: [7], gh: fake.gh }), /gh pr view 7 failed/u)
  } finally {
    cleanup(root, remote)
  }
})

test('a rejected batch falls back per number while a transient failure is reported', () => {
  const root = makeRepository()
  const remote = makeOrigin(root)
  try {
    useGithubOrigin(root)
    const rejected = fakeGh((args) => {
      if (args[0] === 'api') throw new Error('HTTP 422: Something went wrong while executing your query')
      return JSON.stringify({ state: 'OPEN' })
    })
    const states = readPullRequestStates({ root, numbers: [3, 4], gh: rejected.gh })
    assert.deepEqual([...states.keys()], [3, 4])
    assert.deepEqual(rejected.calls.map((args) => args[0]), ['api', 'pr', 'pr'])

    const transient = fakeGh((args) => {
      if (args[0] === 'api') throw new Error('HTTP 503 Service Unavailable')
      return JSON.stringify({ state: 'OPEN' })
    })
    assert.throws(() => readPullRequestStates({ root, numbers: [3, 4], gh: transient.gh }), /503/u)
    assert.equal(transient.calls.length, 1)
  } finally {
    cleanup(root, remote)
  }
})

test('an origin that is not GitHub reads each number without a batch', () => {
  const root = makeRepository()
  const remote = makeOrigin(root)
  try {
    const fake = fakeGh(() => JSON.stringify({ state: 'OPEN' }))
    const states = readPullRequestStates({ root, numbers: [1, 2], gh: fake.gh })
    assert.deepEqual([...states.keys()], [1, 2])
    assert.deepEqual(fake.calls.map((args) => args[1]), ['view', 'view'])
  } finally {
    cleanup(root, remote)
  }
})

test('the state read issues no request without a number to read', () => {
  const root = makeRepository()
  try {
    const fake = fakeGh(() => {
      throw new Error('no read expected')
    })
    assert.deepEqual([...readPullRequestStates({ root, numbers: [], gh: fake.gh })], [])
    assert.deepEqual([...readPullRequestStates({ root, numbers: [0, -1, 'x'], gh: fake.gh })], [])
    assert.equal(fake.calls.length, 0)
  } finally {
    cleanup(root)
  }
})

test('an empty or unreadable batch falls back per number', () => {
  const root = makeRepository()
  const remote = makeOrigin(root)
  try {
    useGithubOrigin(root)
    const empty = fakeGh((args) => (args[0] === 'api' ? undefined : JSON.stringify({ state: 'OPEN' })))
    const emptyStates = readPullRequestStates({ root, numbers: [3, 4], gh: empty.gh })
    assert.deepEqual([...emptyStates.keys()], [3, 4])
    assert.deepEqual(empty.calls.map((args) => args[0]), ['api', 'pr', 'pr'])

    const unreadable = fakeGh((args) => (args[0] === 'api' ? JSON.stringify({ data: { repository: null } }) : JSON.stringify({ state: 'OPEN' })))
    const unreadableStates = readPullRequestStates({ root, numbers: [3], gh: unreadable.gh })
    assert.equal(unreadableStates.get(3), 'OPEN')
    assert.equal(unreadable.calls.length, 2)
  } finally {
    cleanup(root, remote)
  }
})

test('cleanup reads the tracked and local numbers in one request', () => {
  const root = makeRepository()
  const remote = makeOrigin(root)
  try {
    useGithubOrigin(root)
    const prs = {}
    for (let number = 1; number <= 88; number += 1) {
      prs[number] = {
        number,
        head: HEAD,
        base: BASE,
        change: 'widget',
        worktree: join(root, '.cache', 'pr-review', 'worktrees', `pr-${number}`),
        status: 'commented',
      }
    }
    saveState(root, { schemaVersion: 1, prs })
    const fake = fakeGh((args) => {
      const query = String(args[3]).replace(/^query=/u, '')
      const numbers = [...query.matchAll(/p(\d+):pullRequest/gu)].map((match) => Number(match[1]))
      const repository = Object.fromEntries(numbers.map((number) => [`p${number}`, { state: 'OPEN' }]))
      return JSON.stringify({ data: { repository } })
    })
    const cleaned = cleanupClosedPullRequests({ root, gh: fake.gh })
    assert.deepEqual(cleaned, [])
    assert.equal(fake.calls.length, 1)
  } finally {
    cleanup(root, remote)
  }
})

test('a batched and a per-number read reach the same cleanup decision', () => {
  const outcomes = []
  for (const mode of ['batched', 'individual']) {
    const root = makeRepository()
    const remote = makeOrigin(root)
    try {
      if (mode === 'batched') useGithubOrigin(root)
      const worktree = join(root, '.cache', 'pr-review', 'worktrees', 'pr-12')
      saveState(root, {
        schemaVersion: 1,
        prs: { 12: { number: 12, head: HEAD, base: BASE, change: 'widget', worktree, status: 'commented' } },
      })
      const fake = fakeGh((args) => {
        if (args[0] === 'api') return JSON.stringify({ data: { repository: { p12: { state: 'MERGED' } } } })
        return JSON.stringify({ state: 'MERGED' })
      })
      const cleaned = cleanupClosedPullRequests({ root, gh: fake.gh })
      outcomes.push({
        cleaned: cleaned.map(({ number, change, applyState }) => ({ number, change, applyState })),
        state: loadState(root).prs,
        calls: fake.calls.length,
      })
    } finally {
      cleanup(root, remote)
    }
  }
  assert.deepEqual(outcomes[0].cleaned, [{ number: 12, change: 'widget', applyState: null }])
  assert.deepEqual(outcomes[0].cleaned, outcomes[1].cleaned)
  assert.deepEqual(outcomes[0].state, outcomes[1].state)
  assert.deepEqual(outcomes[0].state, {})
  assert.equal(outcomes[0].calls, 1)
  assert.equal(outcomes[1].calls, 1)
})

test('local cleanup decides from a supplied state map without reading', () => {
  const root = makeRepository()
  try {
    saveLocalEntries(root, {
      12: localEntry({ number: 12, phase: 'landed-offline' }),
      13: localEntry({ number: 13, phase: 'pushed' }),
    })
    const fake = fakeGh(() => {
      throw new Error('no read expected')
    })
    const result = cleanupLocalEntries({ root, gh: fake.gh, states: new Map([[12, 'MERGED'], [13, 'OPEN']]) })
    assert.deepEqual(result.removed.map((entry) => entry.number), [13])
    assert.deepEqual(result.retained.map((entry) => entry.number), [12])
    assert.equal(fake.calls.length, 0)
  } finally {
    cleanup(root)
  }
})

test('preflight reports online, offline, unpushed main, landings and the lock', () => {
  const root = makeRepository()
  const remote = makeOrigin(root)
  try {
    const onlineGh = () => JSON.stringify({ nameWithOwner: 'owner/repo' })
    const ready = preflight({ root, gh: onlineGh })
    assert.equal(ready.online, true)
    assert.equal(ready.reason, null)
    assert.equal(ready.offlineLand, false)
    assert.equal(ready.command, null)
    assert.equal(ready.localMain.ahead, 0)
    assert.equal(ready.localMain.behind, 0)
    assert.deepEqual(ready.landings, [])
    assert.equal(ready.lock.held, false)
    assert.equal(existsSync(resolvePaths(root).localState), false)

    git(root, ['commit', '--allow-empty', '-qm', 'unpushed land'])
    const ahead = preflight({ root, gh: onlineGh })
    assert.equal(ahead.reason, 'local-main-ahead')
    assert.equal(ahead.localMain.ahead, 1)
    assert.equal(ahead.offlineLand, false)

    git(root, ['push', '-q', 'origin', 'main'])
    const offline = preflight({ root, gh: () => undefined })
    assert.equal(offline.online, false)
    assert.equal(offline.offlineLand, true)
    assert.equal(offline.reason, 'github-unreachable')
    assert.match(offline.command, /npm run test:lab -- --mock-only/)
    assert.match(offline.command, /openspec_apply_worktree action=land/)

    const landingsFile = join(resolvePaths(root).cache, 'landings.json')
    mkdirSync(dirname(landingsFile), { recursive: true })
    writeFileSync(landingsFile, JSON.stringify({ schemaVersion: 1, lands: { 7: { phase: 'prepared', mode: 'local' } } }))
    const landing = preflight({ root, gh: onlineGh })
    assert.deepEqual(landing.landings, [{ number: 7, phase: 'prepared', mode: 'local' }])
    assert.equal(landing.reason, null)

    acquireLock({ root, session: 'owner-1', token: 'token-1', pr: 12 })
    const held = preflight({ root, gh: onlineGh })
    assert.equal(held.reason, 'landing-lock-held')
    assert.equal(held.lock.held, true)
    assert.equal(held.lock.ownerSession, 'owner-1')
    assert.equal(held.lock.pr, 12)
  } finally {
    cleanup(root, remote)
  }
})


test('the poll text names an owner-managed pull request and keeps candidate lines', () => {
  assert.equal(pollText({ candidates: [], ownerManaged: [] }), 'no review candidates\n')
  assert.equal(
    pollText({ candidates: [], ownerManaged: [12] }),
    'PR #12 owner-managed (skipped)\n',
  )
  const candidate = {
    number: 13,
    head: 'a'.repeat(40),
    change: 'widget',
    resume: false,
  }
  assert.equal(
    pollText({ candidates: [candidate], ownerManaged: [12] }),
    'PR #12 owner-managed (skipped)\nPR #13 aaaaaaaaaaaa widget\n',
  )
})


test('preflight routes a missing gh binary to offline-land instead of a spawn error', () => {
  const root = makeRepository()
  const remote = makeOrigin(root)
  const bin = tempDir('dsh-pr-review-bin-')
  const saved = process.env.PATH
  try {
    const gitPath = spawnSync('which', ['git'], { encoding: 'utf8' }).stdout.trim()
    assert.ok(gitPath !== '', 'git is on PATH')
    symlinkSync(gitPath, join(bin, 'git'))
    process.env.PATH = bin
    const result = preflight({ root })
    assert.equal(result.online, false)
    assert.equal(result.offlineLand, true)
    assert.equal(result.reason, 'github-unreachable')
    assert.match(result.command, /npm run test:lab -- --mock-only/)
  } finally {
    process.env.PATH = saved
    cleanup(root, remote, bin)
  }
})

test('filterCandidates orders mergeable-labeled candidates before the rest', () => {
  const eligible = (number, extra = {}) => ({
    number,
    headRefOid: String(number).padStart(40, 'a'),
    baseRefOid: BASE,
    baseRefName: 'main',
    isDraft: false,
    statusCheckRollup: [{ conclusion: 'SUCCESS' }],
    files: [{ path: 'openspec/changes/widget/proposal.md' }],
    labels: [],
    ...extra,
  })
  const candidates = filterCandidates([
    eligible(12),
    eligible(13, { labels: [{ name: 'mergeable' }] }),
    eligible(14, { isDraft: true, labels: [{ name: 'mergeable' }] }),
    eligible(15),
    eligible(16, { labels: [{ name: 'mergeable' }] }),
  ], { schemaVersion: 1, prs: {} })
  assert.deepEqual(candidates.map((candidate) => candidate.number), [13, 16, 12, 15])
})

test('poll reads the full open list and reports a candidate beyond the old page', () => {
  const root = makeRepository()
  try {
    const rows = []
    for (let number = 1; number <= 100; number += 1) {
      rows.push({
        number,
        headRefOid: String(number).padStart(40, 'a'),
        baseRefOid: BASE,
        baseRefName: 'main',
        isDraft: true,
        statusCheckRollup: [{ conclusion: 'SUCCESS' }],
        files: [{ path: 'openspec/changes/widget/proposal.md' }],
        labels: [],
      })
    }
    rows.push({
      number: 101,
      headRefOid: 'b'.repeat(40),
      baseRefOid: BASE,
      baseRefName: 'main',
      isDraft: false,
      statusCheckRollup: [{ conclusion: 'SUCCESS' }],
      files: [{ path: 'openspec/changes/widget/proposal.md' }],
      labels: [{ name: 'mergeable' }],
    })
    const limits = []
    const gh = (args) => {
      assert.equal(args[0], 'pr')
      assert.equal(args[1], 'list')
      const limit = Number(args[args.indexOf('--limit') + 1])
      limits.push(limit)
      return JSON.stringify(rows.slice(0, limit))
    }
    const result = pollPullRequests({ root, gh })
    assert.deepEqual(result.candidates.map((candidate) => candidate.number), [101])
    assert.deepEqual(limits, [1000])
  } finally {
    cleanup(root)
  }
})

function pollRow(number, head, overrides = {}) {
  return {
    number,
    headRefOid: head,
    baseRefOid: BASE,
    baseRefName: 'main',
    isDraft: false,
    statusCheckRollup: [{ conclusion: 'SUCCESS' }],
    files: [{ path: 'openspec/changes/widget/proposal.md' }],
    labels: [],
    ...overrides,
  }
}

test('a retrying read recovers a transient list failure without the fallback marker', () => {
  const root = makeRepository()
  try {
    const rows = [pollRow(12, HEAD)]
    let lists = 0
    const gh = retryingGh((args) => {
      assert.equal(args[0], 'pr')
      assert.equal(args[1], 'list')
      lists += 1
      if (lists === 1) throw new Error('gh pr list failed: HTTP 504: 504 Gateway Timeout')
      return JSON.stringify(rows)
    })
    const result = pollPullRequests({ root, gh, state: { schemaVersion: 1, prs: {} } })
    assert.equal(lists, 2)
    assert.equal(result.fallback, false)
    assert.deepEqual(result.candidates.map((candidate) => candidate.number), [12])
  } finally {
    cleanup(root)
  }
})

test('the poll adds no retry on top of the read policy', () => {
  const root = makeRepository()
  try {
    const spawns = []
    const spawn = (command, args) => {
      spawns.push(args.join(' '))
      return { status: 1, signal: null, stdout: '', stderr: 'HTTP 502: 502 Bad Gateway' }
    }
    const config = {
      timeoutMs: 20_000,
      attempts: 3,
      backoffMs: [0, 0],
      pollTimeoutMs: 5_000,
      probeTimeoutMs: 5_000,
      fetchTimeoutMs: 30_000,
    }
    const gh = (args) => ghRead(args, { spawn, config, sleep: () => {} })
    assert.throws(
      () => pollPullRequests({ root, gh, state: { schemaVersion: 1, prs: {} } }),
      /gh pr list/u,
    )
    const fullList = spawns.filter((line) => line.includes('files,labels,updatedAt'))
    const scalarList = spawns.filter((line) => line.includes('isDraft,labels'))
    assert.equal(fullList.length, 3)
    assert.equal(scalarList.length, 3)
  } finally {
    cleanup(root)
  }
})

test('the poll falls back to a scalar list plus one detail request per evaluated row', () => {
  const root = makeRepository()
  try {
    const rows = [pollRow(12, HEAD), pollRow(13, BASE)]
    const state = { schemaVersion: 1, prs: {} }
    const direct = pollPullRequests({
      root,
      gh: () => JSON.stringify(rows),
      state,
    })
    const detailNumbers = []
    const gh = (args) => {
      if (args[0] === 'pr' && args[1] === 'list') {
        const fields = args[args.indexOf('--json') + 1]
        if (fields !== 'number,headRefOid,baseRefOid,baseRefName,isDraft,labels') {
          throw new Error('HTTP 502: 502 Bad Gateway (https://api.github.com/graphql)')
        }
        return JSON.stringify(rows.map(({ number, headRefOid, baseRefOid, baseRefName, isDraft, labels }) => ({ number, headRefOid, baseRefOid, baseRefName, isDraft, labels })))
      }
      if (args[0] === 'pr' && args[1] === 'view') {
        detailNumbers.push(Number(args[2]))
        assert.equal(args[args.indexOf('--json') + 1], 'files,statusCheckRollup')
        const row = rows.find((entry) => Number(entry.number) === Number(args[2]))
        return JSON.stringify({ files: row.files, statusCheckRollup: row.statusCheckRollup })
      }
      throw new Error(`unexpected gh ${args.join(' ')}`)
    }
    const degraded = pollPullRequests({ root, gh, state })
    assert.equal(degraded.fallback, true)
    assert.deepEqual(detailNumbers, [12, 13])
    assert.deepEqual(
      degraded.candidates.map((candidate) => candidate.number),
      direct.candidates.map((candidate) => candidate.number),
    )
  } finally {
    cleanup(root)
  }
})

test('the poll fallback skips a recorded commented head and keeps the others', () => {
  const root = makeRepository()
  try {
    const recorded = pollRow(12, HEAD)
    const fresh = pollRow(13, BASE)
    const state = {
      schemaVersion: 1,
      prs: {
        12: { number: 12, head: HEAD, change: 'widget', worktree: null, round: 1, status: 'commented' },
      },
    }
    const detailNumbers = []
    const gh = (args) => {
      if (args[0] === 'pr' && args[1] === 'list') {
        const fields = args[args.indexOf('--json') + 1]
        if (fields !== 'number,headRefOid,baseRefOid,baseRefName,isDraft,labels') {
          throw new Error('HTTP 504: 504 Gateway Timeout')
        }
        return JSON.stringify([recorded, fresh].map(({ number, headRefOid, baseRefOid, baseRefName, isDraft, labels }) => ({ number, headRefOid, baseRefOid, baseRefName, isDraft, labels })))
      }
      if (args[0] === 'pr' && args[1] === 'view') {
        detailNumbers.push(Number(args[2]))
        const row = [recorded, fresh].find((entry) => Number(entry.number) === Number(args[2]))
        return JSON.stringify({ files: row.files, statusCheckRollup: row.statusCheckRollup })
      }
      throw new Error(`unexpected gh ${args.join(' ')}`)
    }
    const result = pollPullRequests({ root, gh, state })
    assert.equal(result.fallback, true)
    assert.deepEqual(detailNumbers, [13])
    assert.deepEqual(result.candidates.map((candidate) => candidate.number), [13])
  } finally {
    cleanup(root)
  }
})

test('a retrying read recovers a transient detail request', () => {
  const root = makeRepository()
  try {
    const row = pollRow(12, HEAD)
    let lists = 0
    let views = 0
    const gh = retryingGh((args) => {
      if (args[0] === 'pr' && args[1] === 'list') {
        lists += 1
        if (lists <= 2) throw new Error('HTTP 504: 504 Gateway Timeout')
        return JSON.stringify([{ number: row.number, headRefOid: row.headRefOid, baseRefOid: row.baseRefOid, baseRefName: row.baseRefName, isDraft: row.isDraft, labels: row.labels }])
      }
      if (args[0] === 'pr' && args[1] === 'view') {
        views += 1
        if (views === 1) throw new Error('gh pr view 12 failed: HTTP 502: 502 Bad Gateway')
        return JSON.stringify({ files: row.files, statusCheckRollup: row.statusCheckRollup })
      }
      throw new Error(`unexpected gh ${args.join(' ')}`)
    })
    const result = pollPullRequests({ root, gh, state: { schemaVersion: 1, prs: {} } })
    assert.equal(views, 2)
    assert.deepEqual(result.candidates.map((candidate) => candidate.number), [12])
  } finally {
    cleanup(root)
  }
})

test('the poll fails instead of reporting a partial candidate list', () => {
  const root = makeRepository()
  try {
    const row = pollRow(12, HEAD)
    const scalarOnly = [{ number: row.number, headRefOid: row.headRefOid, baseRefOid: row.baseRefOid, baseRefName: row.baseRefName, isDraft: row.isDraft, labels: row.labels }]
    let primaryLists = 0
    const scalarUnavailable = (args) => {
      assert.equal(args[0], 'pr')
      assert.equal(args[1], 'list')
      primaryLists += 1
      throw new Error('HTTP 504: 504 Gateway Timeout')
    }
    assert.throws(
      () => pollPullRequests({ root, gh: scalarUnavailable, state: { schemaVersion: 1, prs: {} } }),
      /HTTP 504/,
    )
    assert.equal(primaryLists, 2)
    let lists = 0
    const detailUnavailable = (args) => {
      if (args[0] === 'pr' && args[1] === 'list') {
        lists += 1
        const fields = args[args.indexOf('--json') + 1]
        if (fields !== 'number,headRefOid,baseRefOid,baseRefName,isDraft,labels') {
          throw new Error('HTTP 504: 504 Gateway Timeout')
        }
        return JSON.stringify(scalarOnly)
      }
      assert.equal(args[0], 'pr')
      assert.equal(args[1], 'view')
      throw new Error('HTTP 502: 502 Bad Gateway')
    }
    assert.throws(
      () => pollPullRequests({ root, gh: detailUnavailable, state: { schemaVersion: 1, prs: {} } }),
      /gh pr view 12 failed: HTTP 502/,
    )
    assert.equal(lists, 2)
  } finally {
    cleanup(root)
  }
})

test('a comment publish is attempted once and the failure is recorded', () => {
  const root = makeRepository()
  try {
    saveState(root, {
      schemaVersion: 1,
      prs: {
        12: {
          number: 12,
          head: HEAD,
          base: BASE,
          baseTip: BASE,
          change: 'widget',
          worktree: null,
          round: 1,
          status: 'prepared',
          error: null,
          commentId: null,
          updatedAt: new Date().toISOString(),
        },
      },
    })
    const report = join(root, '.cache', 'pr-review', 'reports', `pr-12-${HEAD}.json`)
    mkdirSync(dirname(report), { recursive: true })
    writeFileSync(report, JSON.stringify({ verdict: 'pass', summary: 'ok', findings: [], verifications: [], round: 1 }))
    let comments = 0
    const gh = (args) => {
      if (args[0] === 'api') return 'maintainer'
      if (args[0] === 'pr' && args[1] === 'view' && args.includes('comments')) return JSON.stringify({ comments: [] })
      if (args[0] === 'pr' && args[1] === 'comment') {
        comments += 1
        throw new Error('gh pr comment 12 failed: HTTP 502: 502 Bad Gateway')
      }
      throw new Error(`unexpected gh ${args.join(' ')}`)
    }
    assert.throws(
      () => publishComment({ root, number: 12, reportPath: report, apply: true, gh, ghWrite: gh }),
      /HTTP 502/,
    )
    assert.equal(comments, 1)
    const state = loadState(root)
    assert.equal(state.prs['12'].status, 'failed')
    assert.match(state.prs['12'].error, /HTTP 502/)
  } finally {
    cleanup(root)
  }
})

/** The PID of a process that does not exist. */
const DEAD_PID = 2_147_483_647

/** Write a run-lock owner file for a test. */
function writeLockOwner(root, owner) {
  const { lock } = resolvePaths(root)
  mkdirSync(lock, { recursive: true })
  writeFileSync(join(lock, 'owner.json'), JSON.stringify(owner))
  return lock
}

/** Capture everything written to stderr while running the callback. */
function captureStderr(run) {
  const chunks = []
  const original = process.stderr.write
  process.stderr.write = (chunk) => {
    chunks.push(String(chunk))
    return true
  }
  try {
    run()
  } finally {
    process.stderr.write = original
  }
  return chunks
}

test('a run lock whose owner is gone is reclaimed and reported', () => {
  const root = makeRepository()
  try {
    writeLockOwner(root, { pid: DEAD_PID, at: new Date().toISOString() })
    const chunks = captureStderr(() => {
      const acquired = acquireRunLock(root)
      assert.equal(acquired.owner.pid, process.pid)
      assert.equal(runLockOwner(resolvePaths(root).lock).pid, process.pid)
    })
    assert.ok(chunks.some((line) => line.includes(`stale-lock-reclaimed pid=${DEAD_PID}`)))
    assert.equal(releaseRunLock(root), true)
    assert.equal(existsSync(resolvePaths(root).lock), false)
  } finally {
    cleanup(root)
  }
})

test('a live owner with the matching start time refuses the run', () => {
  const root = makeRepository()
  try {
    const lock = writeLockOwner(root, {
      pid: process.pid,
      pidStart: processStartTime(process.pid),
      at: new Date().toISOString(),
    })
    assert.throws(() => acquireRunLock(root), /another PR review run holds/)
    assert.equal(existsSync(lock), true)
    rmSync(lock, { recursive: true, force: true })
  } finally {
    cleanup(root)
  }
})

test('a reused PID is reclaimed because its start time differs', () => {
  const root = makeRepository()
  try {
    const current = processStartTime(process.pid)
    assert.notEqual(current, '1')
    writeLockOwner(root, { pid: process.pid, pidStart: '1', at: new Date().toISOString() })
    const acquired = acquireRunLock(root)
    assert.equal(acquired.owner.pid, process.pid)
    assert.equal(releaseRunLock(root), true)
  } finally {
    cleanup(root)
  }
})

test('an owner file without identity fields age out after the reclaim age', () => {
  const root = makeRepository()
  try {
    const now = new Date().toISOString()
    writeLockOwner(root, { pid: process.pid, at: now })
    assert.throws(() => acquireRunLock(root), /another PR review run holds/)

    const old = new Date(Date.now() - 11 * 60_000).toISOString()
    const lock = resolvePaths(root).lock
    writeFileSync(join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, at: old }))
    assert.ok(runLockAgeMs(lock, runLockOwner(lock)) > 10 * 60_000)
    const acquired = acquireRunLock(root)
    assert.equal(acquired.owner.pid, process.pid)
    assert.equal(releaseRunLock(root), true)
  } finally {
    cleanup(root)
  }
})

test('a corrupt owner file is reclaimed only after the reclaim age', () => {
  const root = makeRepository()
  try {
    const { lock } = resolvePaths(root)
    mkdirSync(lock, { recursive: true })
    writeFileSync(join(lock, 'owner.json'), 'not json')
    assert.throws(() => acquireRunLock(root), /owner file is unreadable/)
    const old = new Date(Date.now() - 11 * 60_000)
    utimesSync(lock, old, old)
    const acquired = acquireRunLock(root)
    assert.equal(acquired.owner.pid, process.pid)
    assert.equal(releaseRunLock(root), true)
  } finally {
    cleanup(root)
  }
})

test('a delayed reclaimer restores a lock another process acquired', () => {
  const root = makeRepository()
  try {
    const lock = writeLockOwner(root, {
      pid: DEAD_PID,
      at: '2026-01-01T00:00:00.000Z',
    })
    const judged = runLockOwner(lock)
    const acquired = acquireRunLock(root)
    assert.equal(reclaimStaleRunLock(lock, judged), false)
    const owner = runLockOwner(lock)
    assert.equal(owner.pid, process.pid)
    assert.equal(owner.at, acquired.owner.at)
    assert.equal(releaseRunLock(root), true)
  } finally {
    cleanup(root)
  }
})

test('a displaced owner cannot release a later owner lock', () => {
  const root = makeRepository()
  try {
    const { lock } = acquireRunLock(root)
    writeFileSync(join(lock, 'owner.json'), JSON.stringify({
      pid: process.pid + 1,
      pidStart: '1',
      at: new Date().toISOString(),
    }))
    assert.equal(releaseRunLock(root), false)
    assert.equal(existsSync(lock), true)
    rmSync(lock, { recursive: true, force: true })
  } finally {
    cleanup(root)
  }
})

test('the recorded start time is stable and is not the RSS field', () => {
  const first = processStartTime(process.pid)
  const second = processStartTime(process.pid)
  assert.equal(first, second)
  assert.match(String(first), /^\d+$/u)
  const stat = readFileSync(`/proc/${process.pid}/stat`, 'utf8')
  const fields = stat.slice(stat.lastIndexOf(')') + 1).trim().split(/\s+/u)
  assert.equal(first, fields[19])
  assert.notEqual(first, fields[21])
})

test('preflight reports offline when the probe is killed by its deadline', () => {
  const root = makeRepository()
  const remote = makeOrigin(root)
  try {
    const result = preflight({
      root,
      gh: () => { throw new Error('gh api user timed out after 5000 ms (ETIMEDOUT)') },
    })
    assert.equal(result.online, false)
    assert.equal(result.reason, 'github-unreachable')
    assert.equal(result.offlineLand, true)
    assert.match(result.command, /offline|test:lab/u)
  } finally {
    cleanup(root, remote)
  }
})

test('preflight reports origin-unreachable when the fetch is killed', () => {
  const root = makeRepository()
  const remote = makeOrigin(root)
  try {
    const result = preflight({
      root,
      gh: () => JSON.stringify({ login: 'maintainer' }),
      fetch: () => false,
    })
    assert.equal(result.online, true)
    assert.equal(result.reason, 'origin-unreachable')
    assert.equal(result.offlineLand, true)
  } finally {
    cleanup(root, remote)
  }
})

test('a run-lock command records one telemetry line and keeps the JSON result', () => {
  const root = makeRepository()
  const remote = makeOrigin(root)
  const previous = process.cwd()
  try {
    process.chdir(root)
    const output = []
    const code = main(['state', '--cleanup', '--json'], (text) => output.push(text))
    assert.equal(code, 0)
    assert.deepEqual(JSON.parse(output.join('')), [])
    const telemetry = join(root, '.cache', 'pr-review', 'runs.jsonl')
    const lines = readFileSync(telemetry, 'utf8').trim().split('\n')
    assert.equal(lines.length, 1)
    const record = JSON.parse(lines[0])
    assert.equal(record.command, 'state --cleanup')
    assert.equal(record.ghCalls, 0)
    assert.equal(record.transientFailures, 0)
    assert.equal(record.outcome, 'ok')
    assert.ok(Number.isInteger(record.durationMs) && record.durationMs >= 0)

    const before = readFileSync(telemetry, 'utf8')
    main(['state', '--json'], () => {})
    assert.equal(readFileSync(telemetry, 'utf8'), before)
  } finally {
    process.chdir(previous)
    cleanup(root, remote)
  }
})

test('cleanup keeps only the most recent telemetry lines', () => {
  const root = makeRepository()
  const remote = makeOrigin(root)
  const previous = process.cwd()
  try {
    const telemetry = join(root, '.cache', 'pr-review', 'runs.jsonl')
    mkdirSync(dirname(telemetry), { recursive: true })
    const old = Array.from({ length: 2100 }, (_, index) => JSON.stringify({ command: `old-${index}` }))
    writeFileSync(telemetry, `${old.join('\n')}\n`)
    process.chdir(root)
    const code = main(['state', '--cleanup', '--json'], () => {})
    assert.equal(code, 0)
    const lines = readFileSync(telemetry, 'utf8').trim().split('\n')
    assert.equal(lines.length, 2000)
    assert.equal(JSON.parse(lines.at(-1)).command, 'state --cleanup')
    assert.equal(JSON.parse(lines[0]).command, 'old-101')
  } finally {
    process.chdir(previous)
    cleanup(root, remote)
  }
})

test('a failing run-lock command records a failed outcome without trimming', () => {
  const root = makeRepository()
  const remote = makeOrigin(root)
  const previous = process.cwd()
  try {
    const telemetry = join(root, '.cache', 'pr-review', 'runs.jsonl')
    mkdirSync(dirname(telemetry), { recursive: true })
    const old = Array.from({ length: 2100 }, (_, index) => JSON.stringify({ command: `old-${index}` }))
    writeFileSync(telemetry, `${old.join('\n')}\n`)
    process.chdir(root)
    const code = main(['state', '--fail', '999', '--error', 'boom'], () => {})
    assert.equal(code, 1)
    const lines = readFileSync(telemetry, 'utf8').trim().split('\n')
    assert.equal(lines.length, 2101)
    const record = JSON.parse(lines.at(-1))
    assert.equal(record.command, 'state --fail')
    assert.equal(record.outcome, 'failed')
  } finally {
    process.chdir(previous)
    cleanup(root, remote)
  }
})
