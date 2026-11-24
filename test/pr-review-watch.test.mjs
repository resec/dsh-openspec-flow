import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

import {
  activeChangeNames,
  checksGreen,
  cleanupClosedPullRequests,
  filterCandidates,
  forgetPullRequest,
  hasReviewRound,
  hasTrustedMarker,
  loadState,
  main,
  markFailed,
  parseArgs,
  pollPullRequests,
  preparePullRequest,
  publishComment,
  readReport,
  renderReport,
  saveState,
  stateCommand,
  withRunLock,
} from '../scripts/pr-review-watch.mjs'

const HEAD = 'a'.repeat(40)
const BASE = 'b'.repeat(40)

function git(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

function makeRepository() {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-pr-review-watch-'))
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
  const remote = mkdtempSync(join(tmpdir(), 'dsh-pr-review-remote-'))
  git(remote, ['init', '--bare', '-q'])
  git(root, ['remote', 'add', 'origin', remote])
  git(root, ['push', '-q', '-u', 'origin', 'main'])
  return remote
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

function reviewRecord(root, change, rounds, name = `local#${change}`, extra = {}) {
  const common = git(root, ['rev-parse', '--path-format=absolute', '--git-common-dir'])
  const directory = join(common, 'openspec-flow', 'review', name)
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, 'apply-review.json'), JSON.stringify({ state: 'in-review', rounds, ...extra }))
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
  const root = mkdtempSync(join(tmpdir(), 'dsh-pr-review-report-'))
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
    const posted = publishComment({ root, number: 12, reportPath: report, apply: true, gh })
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
    const result = publishComment({ root, number: 12, reportPath: report, apply: true, gh })
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
    const cleanupGh = fakeGh(() => JSON.stringify({ state: 'MERGED', mergedAt: '2026-01-01T00:00:00Z' })).gh
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
    assert.equal(pollPullRequests({ root, gh }).length, 1)
    const first = preparePullRequest({ root, number: 12, gh })
    const report = (path, round) => {
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, JSON.stringify({ verdict: 'pass', summary: 'ok', findings: [], verifications: [], round }))
      return path
    }
    const firstReport = report(join(root, '.cache', 'pr-review', 'reports', `pr-12-${head}.json`), 1)
    assert.equal(publishComment({ root, number: 12, reportPath: firstReport, gh }).dryRun, true)
    assert.equal(publishComment({ root, number: 12, reportPath: firstReport, apply: true, gh }).published, true)
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
    assert.equal(publishComment({ root, number: 12, reportPath: secondReport, apply: true, gh }).published, true)
    assert.equal(calls.filter((args) => args[0] === 'pr' && args[1] === 'comment').length, 2)
  } finally {
    cleanup(root, remote)
  }
})

test('a prepared head without a review round is emitted for its first start', () => {
  const root = makeRepository()
  try {
    const head = git(root, ['rev-parse', 'HEAD'])
    const worktree = join(root, '.cache', 'pr-review', 'worktrees', 'pr-12')
    saveState(root, {
      schemaVersion: 1,
      prs: { 12: { number: 12, head, change: 'widget', status: 'prepared', round: 0, worktree } },
    })
    const { gh } = fakeGh(() => JSON.stringify([{
      number: 12,
      headRefOid: head,
      baseRefOid: BASE,
      baseRefName: 'main',
      isDraft: false,
      statusCheckRollup: [{ conclusion: 'SUCCESS' }],
      files: [{ path: 'openspec/changes/widget/proposal.md' }],
    }]))
    const fresh = pollPullRequests({ root, gh })
    assert.equal(fresh.length, 1)
    assert.equal(fresh[0].status, 'prepared')
    assert.equal(fresh[0].resume, false)
    assert.equal(fresh[0].worktree, worktree)
    reviewRecord(root, 'widget', [{ round: 1, treeSha: git(root, ['rev-parse', `${head}^{tree}`]) }])
    const retried = pollPullRequests({ root, gh })
    assert.equal(retried.length, 1)
    assert.equal(retried[0].resume, true)
  } finally {
    cleanup(root)
  }
})

test('the review record is matched by change name and reviewed tree', () => {
  const root = makeRepository()
  const outside = mkdtempSync(join(tmpdir(), 'dsh-pr-review-nogit-'))
  try {
    const head = git(root, ['rev-parse', 'HEAD'])
    const tree = git(root, ['rev-parse', `${head}^{tree}`])
    assert.equal(hasReviewRound(root, 'widget', head), false)
    assert.equal(hasReviewRound(outside, 'widget', head), false)
    reviewRecord(root, 'other', [{ round: 1, treeSha: tree }])
    assert.equal(hasReviewRound(root, 'widget', head), false)
    reviewRecord(root, 'widget', [])
    assert.equal(hasReviewRound(root, 'widget', head), false)
    reviewRecord(root, 'widget', [{ round: 1, treeSha: BASE }])
    assert.equal(hasReviewRound(root, 'widget', head), false)
    reviewRecord(root, 'widget', [{ round: 1, treeSha: tree }])
    assert.equal(hasReviewRound(root, 'widget', head), true)
    assert.equal(hasReviewRound(root, 'widget', BASE), false)
    reviewRecord(root, 'gizmo', [], 'local#gizmo@root-abc123456789', { extraRounds: [{ round: 'E1', objectHash: tree }] })
    assert.equal(hasReviewRound(root, 'gizmo', head), true)
    reviewRecord(root, 'gadget', [{ round: 1, treeSha: tree }], 'store-1#gadget')
    assert.equal(hasReviewRound(root, 'gadget', head), true)
  } finally {
    cleanup(root, outside)
  }
})

test('a new head is a new round while a commented head is skipped', () => {
  const state = {
    schemaVersion: 1,
    prs: {
      12: { head: HEAD, status: 'prepared', change: 'widget', base: BASE, worktree: '/tmp/widget' },
      13: { head: HEAD, status: 'commented', change: 'widget' },
      14: { head: BASE, status: 'prepared', change: 'widget', base: BASE, worktree: '/tmp/widget-14' },
      15: { head: HEAD, status: 'failed', change: 'gadget', base: BASE, worktree: '/tmp/gadget-15' },
    },
  }
  const files = [{ path: 'openspec/changes/widget/proposal.md' }]
  const candidates = filterCandidates([
    { number: 12, headRefOid: HEAD, baseRefOid: BASE, baseRefName: 'main', isDraft: false, statusCheckRollup: [{ conclusion: 'SUCCESS' }], files },
    { number: 13, headRefOid: HEAD, baseRefOid: BASE, baseRefName: 'main', isDraft: false, statusCheckRollup: [{ conclusion: 'SUCCESS' }], files },
    { number: 14, headRefOid: HEAD, baseRefOid: BASE, baseRefName: 'main', isDraft: false, statusCheckRollup: [{ conclusion: 'SUCCESS' }], files },
    { number: 15, headRefOid: HEAD, baseRefOid: BASE, baseRefName: 'main', isDraft: false, statusCheckRollup: [{ conclusion: 'SUCCESS' }], files: [{ path: 'openspec/changes/gadget/proposal.md' }] },
  ], state, (change) => change === 'widget')
  assert.deepEqual(candidates.map((candidate) => candidate.number), [12, 14, 15])
  assert.equal(candidates[0].resume, true)
  assert.equal(candidates[0].worktree, '/tmp/widget')
  assert.equal(candidates[1].status, 'new')
  assert.equal(candidates[1].resume, false)
  assert.equal(candidates[2].status, 'failed')
  assert.equal(candidates[2].resume, false)
})

test('documentation keeps the prepared start branch', () => {
  const doc = readFileSync(new URL('../docs/pr-review.md', import.meta.url), 'utf8')
  assert.match(doc, /`resume` is false/)
  assert.match(doc, /`state=not-started`/)
  assert.match(doc, /start the first round/)
  assert.match(doc, /must not go to `state --fail`/)
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
    assert.deepEqual(pollPullRequests({ root, gh }), [])
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
    const head = git(root, ['rev-parse', 'HEAD'])
    saveState(root, { schemaVersion: 1, prs: { 12: { number: 12, head, base: BASE, change: 'widget', round: 0, status: 'prepared' } } })
    const report = join(root, '.cache', 'pr-review', 'reports', `pr-12-${head}.json`)
    mkdirSync(dirname(report), { recursive: true })
    writeFileSync(report, JSON.stringify({ verdict: 'pass', summary: 'ok', findings: [], verifications: [] }))
    const { gh } = fakeGh((args) => {
      if (args[0] === 'api') return 'maintainer'
      if (args[0] === 'pr' && args[1] === 'view') return JSON.stringify({ comments: [] })
      if (args[0] === 'pr' && args[1] === 'comment') return undefined
      return undefined
    })
    assert.throws(() => publishComment({ root, number: 12, reportPath: report, apply: true, gh }), /pr comment/)
    assert.equal(loadState(root).prs['12'].status, 'failed')
    reviewRecord(root, 'widget', [{ round: 1, treeSha: git(root, ['rev-parse', `${head}^{tree}`]) }])
    const candidates = filterCandidates([{ number: 12, headRefOid: head, baseRefOid: BASE, baseRefName: 'main', isDraft: false, statusCheckRollup: [{ conclusion: 'SUCCESS' }], files: [{ path: 'openspec/changes/widget/proposal.md' }] }], loadState(root), (change, sha) => hasReviewRound(root, change, sha))
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
    const head = git(root, ['rev-parse', 'HEAD'])
    saveState(root, { schemaVersion: 1, prs: { 12: { number: 12, head, base: BASE, change: 'widget', worktree: '/tmp/pr-12', round: 0, status: 'prepared' } } })
    const failed = markFailed({ root, number: 12, error: 'reviewer timed out' })
    assert.equal(failed.status, 'failed')
    assert.equal(failed.error, 'reviewer timed out')
    reviewRecord(root, 'widget', [{ round: 1, treeSha: git(root, ['rev-parse', `${head}^{tree}`]) }])
    const candidates = filterCandidates([{ number: 12, headRefOid: head, baseRefOid: BASE, baseRefName: 'main', isDraft: false, statusCheckRollup: [{ conclusion: 'SUCCESS' }], files: [{ path: 'openspec/changes/widget/proposal.md' }] }], loadState(root), (change, sha) => hasReviewRound(root, change, sha))
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
