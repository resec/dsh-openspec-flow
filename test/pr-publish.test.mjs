import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

import {
  listBranchPullRequests,
  main,
  parseArgs,
  publishBody,
  publishGates,
  publishPullRequest,
  pullRequestNumber,
} from '../scripts/pr-publish.mjs'
import { loadLocalState, resolvePaths } from '../scripts/pr-review-watch.mjs'
import { ghText } from '../scripts/pr-local-shared.mjs'
import { acquireLock, forceRelease } from '../scripts/pr-review-lock.mjs'
import { cleanupTempDirs, tempDir } from './temp.mjs'

test.after(cleanupTempDirs)

const CHANGE = 'widget'
const BRANCH = 'openspec/apply/local-widget-12345678'

function runGit(cwd, args, allowFailure = false) {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  if (result.status !== 0) return undefined
  return result.stdout.trim()
}

function mustGit(cwd, args) {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

function makeFixture() {
  const root = tempDir('dsh-pr-publish-')
  const remote = tempDir('dsh-pr-publish-remote-')
  mustGit(remote, ['init', '--bare', '-q'])
  mustGit(root, ['init', '-q', '-b', 'main'])
  mustGit(root, ['config', 'user.email', 'test@example.com'])
  mustGit(root, ['config', 'user.name', 'Test'])
  writeFileSync(join(root, 'README.md'), '# base\n')
  writeFileSync(join(root, '.gitignore'), '.cache/\n')
  mustGit(root, ['add', '.'])
  mustGit(root, ['commit', '-qm', 'base'])
  mustGit(root, ['remote', 'add', 'origin', remote])
  mustGit(root, ['push', '-q', '-u', 'origin', 'main'])
  const base = mustGit(root, ['rev-parse', 'HEAD'])
  const change = join(root, 'openspec', 'changes', CHANGE)
  mkdirSync(change, { recursive: true })
  writeFileSync(join(change, '.openspec.yaml'), 'schema: spec-driven\n')
  writeFileSync(join(change, 'proposal.md'), '# Widget\n')
  mustGit(root, ['add', `openspec/changes/${CHANGE}`])
  mustGit(root, ['commit', '-qm', 'seal the draft'])
  const seal = mustGit(root, ['rev-parse', 'HEAD'])
  mustGit(root, ['reset', '-q', '--mixed', 'HEAD^'])
  const worktree = join(root, '.cache', 'openspec-flow', 'worktrees', `local#${CHANGE}`)
  mkdirSync(dirname(worktree), { recursive: true })
  mustGit(root, ['worktree', 'add', '-q', '-b', BRANCH, worktree, seal])
  writeFileSync(join(worktree, 'feature.txt'), 'feature\n')
  mustGit(worktree, ['add', 'feature.txt'])
  mustGit(worktree, ['commit', '-qm', 'feature work'])
  const head = mustGit(worktree, ['rev-parse', 'HEAD'])
  const tree = mustGit(worktree, ['rev-parse', 'HEAD^{tree}'])
  const common = mustGit(root, ['rev-parse', '--path-format=absolute', '--git-common-dir'])
  const applyDirectory = join(common, 'openspec-flow', 'apply')
  mkdirSync(applyDirectory, { recursive: true })
  writeFileSync(join(applyDirectory, `local#${CHANGE}.json`), `${JSON.stringify({
    schemaVersion: 1,
    change: CHANGE,
    store: null,
    mainRoot: root,
    worktree,
    branch: BRANCH,
    baseCommit: base,
    sealedCommit: seal,
    status: 'active',
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
    lockToken: null,
    lockPid: null,
  }, null, 2)}\n`)
  return { root, remote, base, seal, worktree, head, tree, common, stateFile: join(applyDirectory, `local#${CHANGE}.json`) }
}

function writeReview(root, tree, overrides = {}) {
  const directory = join(resolvePaths(root).commonDir, 'openspec-flow', 'review', `local#${CHANGE}`)
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, 'apply-review.json'), `${JSON.stringify({
    id: 'review-1',
    state: 'passed',
    treeSha: tree,
    mode: 'reviewer',
    independent: true,
    findings: [],
    ...overrides,
  }, null, 2)}\n`)
  return directory
}

function fakeGh({ repo = true, pullRequests = [], createUrl = 'https://github.com/o/r/pull/21', ready = '' } = {}) {
  const calls = []
  const bodies = []
  const gh = (args, cwd) => {
    calls.push(args)
    if (args[0] === 'repo' && args[1] === 'view') return repo ? JSON.stringify({ nameWithOwner: 'owner/repo' }) : undefined
    if (args[0] === 'pr' && args[1] === 'list') return JSON.stringify(pullRequests)
    if (args[0] === 'pr' && args[1] === 'create') {
      const index = args.indexOf('--body-file')
      if (index >= 0) bodies.push(readFileSync(args[index + 1], 'utf8'))
      return createUrl
    }
    if (args[0] === 'pr' && args[1] === 'edit') {
      const index = args.indexOf('--body-file')
      if (index >= 0) bodies.push(readFileSync(args[index + 1], 'utf8'))
      return ''
    }
    if (args[0] === 'pr' && args[1] === 'ready') return ready === null ? undefined : ready
    return undefined
  }
  return { gh, calls, bodies, cwd: undefined }
}

function originBranch(remote, branch) {
  const result = spawnSync('git', ['--git-dir', remote, 'rev-parse', `refs/heads/${branch}`], { encoding: 'utf8' })
  return result.status === 0 ? result.stdout.trim() : undefined
}

function cleanup(...directories) {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true })
}

test('parseArgs, the marker body and the pull-request number are strict', () => {
  assert.equal(parseArgs(['--help']).command, 'help')
  const parsed = parseArgs(['--apply', '--session', 's1', '--token', 't1', '--json', '--change', CHANGE])
  assert.equal(parsed.apply, true)
  assert.equal(parsed.session, 's1')
  assert.equal(parsed.token, 't1')
  assert.equal(parsed.json, true)
  assert.equal(parsed.change, CHANGE)
  assert.throws(() => parseArgs(['--apply']), /needs --session/)
  assert.throws(() => parseArgs(['--session']), /needs a value/)
  assert.throws(() => parseArgs(['--session', 's', 'bogus']), /unexpected argument/)
  let output = ''
  assert.equal(main(['--help'], (text) => { output += text }), 0)
  assert.match(output, /pr-publish\.mjs/)
  assert.match(output, /--apply/)
  assert.equal(main(['--bogus'], (text) => { output += text }), 2)
  assert.equal(pullRequestNumber('https://github.com/o/r/pull/21'), 21)
  assert.equal(pullRequestNumber('no number'), undefined)
  const body = publishBody({ change: CHANGE, tree: 'a'.repeat(40), record: 'review-1', session: 's1' })
  assert.match(body, /local-apply-review: change=widget tree=a{40} review=review-1 session=s1/)
  assert.match(body, /owner-managed/)
})

test('a dry run reports the publication and writes nothing', () => {
  const fixture = makeFixture()
  try {
    writeReview(fixture.root, fixture.tree)
    const { gh, calls } = fakeGh()
    const result = publishPullRequest({
      root: fixture.root,
      worktree: fixture.worktree,
      session: 'owner-1',
      gh,
      git: runGit,
    })
    assert.equal(result.dryRun, true)
    assert.equal(result.change, CHANGE)
    assert.equal(result.branch, BRANCH)
    assert.equal(result.head, fixture.head)
    assert.equal(result.tree, fixture.tree)
    assert.equal(result.record, 'review-1')
    assert.equal(result.action, 'create')
    assert.equal(result.number, null)
    assert.equal(originBranch(fixture.remote, BRANCH), undefined)
    assert.equal(existsSync(resolvePaths(fixture.root).localState), false)
    assert.equal(existsSync(resolvePaths(fixture.root).landingLock), false)
    assert.equal(calls.some((args) => args[0] === 'pr' && ['create', 'edit', 'ready'].includes(args[1])), false)
    assert.equal(mustGit(fixture.worktree, ['rev-parse', 'HEAD']), fixture.head)
  } finally {
    cleanup(fixture.root, fixture.remote)
  }
})

test('the gates refuse a worktree outside the plugin directory and a missing apply state', () => {
  const fixture = makeFixture()
  try {
    writeReview(fixture.root, fixture.tree)
    assert.throws(
      () => publishGates({ root: fixture.root, worktree: fixture.root, session: 'owner-1', gh: fakeGh().gh, git: runGit }),
      /not an active plugin apply worktree/,
    )
    assert.throws(
      () => publishGates({ root: fixture.root, worktree: join(fixture.root, 'elsewhere'), session: 'owner-1', gh: fakeGh().gh, git: runGit }),
      /not an active plugin apply worktree/,
    )
  } finally {
    cleanup(fixture.root, fixture.remote)
  }
})

test('the gates refuse a dirty worktree, an unpassed review and a mismatched tree', () => {
  const fixture = makeFixture()
  try {
    writeReview(fixture.root, fixture.tree)
    const gates = () => publishGates({
      root: fixture.root,
      worktree: fixture.worktree,
      session: 'owner-1',
      gh: fakeGh().gh,
      git: runGit,
    })
    assert.equal(gates().head, fixture.head)
    writeFileSync(join(fixture.worktree, 'dirty.txt'), 'dirty\n')
    assert.throws(gates, /not clean/)
    rmSync(join(fixture.worktree, 'dirty.txt'))
    writeReview(fixture.root, fixture.tree, { state: 'in-review' })
    assert.throws(gates, /not passed/)
    writeReview(fixture.root, 'f'.repeat(40))
    assert.throws(gates, /does not match/)
    writeReview(fixture.root, fixture.tree, { findings: [{ id: 'R1-01', status: 'open', severity: 'major' }] })
    assert.throws(gates, /open finding/)
  } finally {
    cleanup(fixture.root, fixture.remote)
  }
})

test('the gates refuse a main planning copy that differs from the seal', () => {
  const fixture = makeFixture()
  try {
    writeReview(fixture.root, fixture.tree)
    writeFileSync(join(fixture.root, 'openspec', 'changes', CHANGE, 'proposal.md'), '# Changed\n')
    assert.throws(
      () => publishGates({ root: fixture.root, worktree: fixture.worktree, session: 'owner-1', gh: fakeGh().gh, git: runGit }),
      /differs from the seal/,
    )
  } finally {
    cleanup(fixture.root, fixture.remote)
  }
})

test('the gates refuse local main ahead of origin/main and name push-landed', () => {
  const fixture = makeFixture()
  try {
    writeReview(fixture.root, fixture.tree)
    mustGit(fixture.root, ['commit', '--allow-empty', '-qm', 'unpushed land'])
    assert.throws(
      () => publishGates({ root: fixture.root, worktree: fixture.worktree, session: 'owner-1', gh: fakeGh().gh, git: runGit }),
      /push-landed\.mjs --push.*--offline/,
    )
    mustGit(fixture.root, ['push', '-q', 'origin', 'main'])
    assert.equal(
      publishGates({ root: fixture.root, worktree: fixture.worktree, session: 'owner-1', gh: fakeGh().gh, git: runGit }).change,
      CHANGE,
    )
  } finally {
    cleanup(fixture.root, fixture.remote)
  }
})

test('an offline GitHub routes to offline-land without writing', () => {
  const fixture = makeFixture()
  try {
    writeReview(fixture.root, fixture.tree)
    const fake = fakeGh({ repo: false })
    const result = publishPullRequest({
      root: fixture.root,
      worktree: fixture.worktree,
      session: 'owner-1',
      apply: true,
      gh: fake.gh,
      git: runGit,
    })
    assert.equal(result.offlineLand, true)
    assert.equal(result.action, 'offline-land')
    assert.equal(result.reason, 'github-unreachable')
    assert.match(result.command, /npm run test:lab -- --mock-only/)
    assert.match(result.command, /openspec_worktree action=land|openspec_apply_worktree action=land/)
    assert.equal(originBranch(fixture.remote, BRANCH), undefined)
    assert.equal(existsSync(resolvePaths(fixture.root).localState), false)
    assert.equal(existsSync(resolvePaths(fixture.root).landingLock), false)
    assert.equal(fake.calls.filter((args) => args[0] === 'pr').length, 0)
  } finally {
    cleanup(fixture.root, fixture.remote)
  }
})

test('the gates refuse an unfinished landing and another owner lock', () => {
  const fixture = makeFixture()
  try {
    writeReview(fixture.root, fixture.tree)
    const landings = join(resolvePaths(fixture.root).cache, 'landings.json')
    mkdirSync(dirname(landings), { recursive: true })
    writeFileSync(landings, JSON.stringify({ schemaVersion: 1, lands: { 9: { phase: 'prepared' } } }))
    assert.throws(
      () => publishGates({ root: fixture.root, worktree: fixture.worktree, session: 'owner-1', gh: fakeGh().gh, git: runGit }),
      /already landing in phase prepared/,
    )
    rmSync(landings)
    acquireLock({ root: fixture.root, session: 'other', token: 'other-token', pr: 9 })
    assert.throws(
      () => publishGates({ root: fixture.root, worktree: fixture.worktree, session: 'owner-1', gh: fakeGh().gh, git: runGit }),
      /held by session other for PR #9/,
    )
    forceRelease({ root: fixture.root, reason: 'test' })
    acquireLock({ root: fixture.root, session: 'owner-1', token: 'owner-token', pr: 12 })
    assert.throws(
      () => publishGates({ root: fixture.root, worktree: fixture.worktree, session: 'owner-1', gh: fakeGh().gh, git: runGit }),
      /recorded --token/,
    )
    assert.throws(
      () => publishGates({ root: fixture.root, worktree: fixture.worktree, session: 'owner-1', token: 'wrong', gh: fakeGh().gh, git: runGit }),
      /recorded --token/,
    )
    assert.equal(publishGates({
      root: fixture.root,
      worktree: fixture.worktree,
      session: 'owner-1',
      token: 'owner-token',
      gh: fakeGh().gh,
      git: runGit,
    }).change, CHANGE)
  } finally {
    cleanup(fixture.root, fixture.remote)
  }
})

test('a local entry owned by another session is refused', () => {
  const fixture = makeFixture()
  try {
    writeReview(fixture.root, fixture.tree)
    const local = {
      schemaVersion: 1,
      prs: {
        12: {
          number: 12,
          change: CHANGE,
          branch: BRANCH,
          head: fixture.head,
          tree: fixture.tree,
          record: 'review-1',
          ownerSession: 'other',
          phase: 'published',
        },
      },
    }
    const file = resolvePaths(fixture.root).localState
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, JSON.stringify(local))
    assert.throws(
      () => publishGates({ root: fixture.root, worktree: fixture.worktree, session: 'owner-1', gh: fakeGh().gh, git: runGit }),
      /belongs to session other/,
    )
  } finally {
    cleanup(fixture.root, fixture.remote)
  }
})

test('a closed pull request is refused before a push', () => {
  const fixture = makeFixture()
  try {
    writeReview(fixture.root, fixture.tree)
    const closed = [{ number: 21, state: 'CLOSED', isDraft: false, url: 'https://example.test/21', headRefOid: fixture.head }]
    assert.throws(
      () => publishPullRequest({
        root: fixture.root,
        worktree: fixture.worktree,
        session: 'owner-1',
        apply: true,
        gh: fakeGh({ pullRequests: closed }).gh,
        git: runGit,
      }),
      /closed; it is not reopened/,
    )
    assert.equal(originBranch(fixture.remote, BRANCH), undefined)
    assert.equal(existsSync(resolvePaths(fixture.root).localState), false)
  } finally {
    cleanup(fixture.root, fixture.remote)
  }
})

test('apply pushes the branch, opens a draft PR, writes the entry and marks it ready', () => {
  const fixture = makeFixture()
  try {
    writeReview(fixture.root, fixture.tree)
    const fake = fakeGh()
    const result = publishPullRequest({
      root: fixture.root,
      worktree: fixture.worktree,
      session: 'owner-1',
      apply: true,
      gh: fake.gh,
      git: runGit,
    })
    assert.equal(result.dryRun, false)
    assert.equal(result.number, 21)
    assert.equal(result.action, 'created')
    assert.equal(result.pushed, true)
    assert.equal(result.ready, true)
    assert.equal(originBranch(fixture.remote, BRANCH), fixture.head)
    const create = fake.calls.find((args) => args[0] === 'pr' && args[1] === 'create')
    assert.ok(create)
    assert.ok(create.includes('--draft'))
    assert.equal(create[create.indexOf('--base') + 1], 'main')
    assert.equal(create[create.indexOf('--head') + 1], BRANCH)
    assert.match(fake.bodies[0], /local-apply-review: change=widget/)
    const readyCalls = fake.calls.filter((args) => args[0] === 'pr' && args[1] === 'ready')
    assert.deepEqual(readyCalls[0], ['pr', 'ready', '21'])
    assert.equal(fake.calls.some((args) => args.some((value) => String(value).includes('--add-label'))), false)
    assert.equal(fake.calls.some((args) => args[0] === 'pr' && args[1] === 'comment'), false)
    const entry = loadLocalState(fixture.root).prs['21']
    assert.equal(entry.number, 21)
    assert.equal(entry.change, CHANGE)
    assert.equal(entry.branch, BRANCH)
    assert.equal(entry.head, fixture.head)
    assert.equal(entry.tree, fixture.tree)
    assert.equal(entry.record, 'review-1')
    assert.equal(entry.ownerSession, 'owner-1')
    assert.equal(entry.phase, 'published')
    assert.ok(result.lock.token)
    const lock = JSON.parse(readFileSync(join(resolvePaths(fixture.root).landingLock, 'owner.json'), 'utf8'))
    assert.equal(lock.ownerSession, 'owner-1')
    assert.equal(lock.token, result.lock.token)
    assert.equal(lock.pr, 21)
  } finally {
    cleanup(fixture.root, fixture.remote)
  }
})

test('a repeated publication reuses the open pull request and updates the entry', () => {
  const fixture = makeFixture()
  try {
    writeReview(fixture.root, fixture.tree)
    const first = publishPullRequest({
      root: fixture.root,
      worktree: fixture.worktree,
      session: 'owner-1',
      apply: true,
      gh: fakeGh().gh,
      git: runGit,
    })
    assert.equal(first.action, 'created')
    writeFileSync(join(fixture.worktree, 'second.txt'), 'second\n')
    mustGit(fixture.worktree, ['add', 'second.txt'])
    mustGit(fixture.worktree, ['commit', '-qm', 'second'])
    const head = mustGit(fixture.worktree, ['rev-parse', 'HEAD'])
    const tree = mustGit(fixture.worktree, ['rev-parse', 'HEAD^{tree}'])
    writeReview(fixture.root, tree)
    const open = [{ number: 21, state: 'OPEN', isDraft: false, url: 'https://example.test/21', headRefOid: head }]
    const fake = fakeGh({ pullRequests: open })
    const second = publishPullRequest({
      root: fixture.root,
      worktree: fixture.worktree,
      session: 'owner-1',
      token: first.lock.token,
      apply: true,
      gh: fake.gh,
      git: runGit,
    })
    assert.equal(second.action, 'updated')
    assert.equal(second.number, 21)
    assert.equal(fake.calls.some((args) => args[0] === 'pr' && args[1] === 'create'), false)
    assert.equal(fake.calls.some((args) => args[0] === 'pr' && args[1] === 'edit'), true)
    assert.equal(originBranch(fixture.remote, BRANCH), head)
    const entry = loadLocalState(fixture.root).prs['21']
    assert.equal(entry.head, head)
    assert.equal(entry.tree, tree)
    assert.equal(entry.phase, 'published')
    assert.ok(fake.bodies.every((body) => /local-apply-review: change=widget/.test(body)))
  } finally {
    cleanup(fixture.root, fixture.remote)
  }
})

test('a wrong token refuses a repeated publication before any push', () => {
  const fixture = makeFixture()
  try {
    writeReview(fixture.root, fixture.tree)
    const first = publishPullRequest({
      root: fixture.root,
      worktree: fixture.worktree,
      session: 'owner-1',
      apply: true,
      gh: fakeGh().gh,
      git: runGit,
    })
    assert.equal(originBranch(fixture.remote, BRANCH), fixture.head)
    writeFileSync(join(fixture.worktree, 'second.txt'), 'second\n')
    mustGit(fixture.worktree, ['add', 'second.txt'])
    mustGit(fixture.worktree, ['commit', '-qm', 'second'])
    const head = mustGit(fixture.worktree, ['rev-parse', 'HEAD'])
    writeReview(fixture.root, mustGit(fixture.worktree, ['rev-parse', 'HEAD^{tree}']))
    const open = [{ number: 21, state: 'OPEN', isDraft: false, url: 'https://example.test/21', headRefOid: head }]
    assert.throws(
      () => publishPullRequest({
        root: fixture.root,
        worktree: fixture.worktree,
        session: 'owner-1',
        token: 'wrong-token',
        apply: true,
        gh: fakeGh({ pullRequests: open }).gh,
        git: runGit,
      }),
      /recorded --token/,
    )
    assert.equal(originBranch(fixture.remote, BRANCH), fixture.head)
    assert.equal(loadLocalState(fixture.root).prs['21'].head, fixture.head)
    assert.equal(first.number, 21)
  } finally {
    cleanup(fixture.root, fixture.remote)
  }
})

test('a failed ready marking records the failed phase', () => {
  const fixture = makeFixture()
  try {
    writeReview(fixture.root, fixture.tree)
    assert.throws(
      () => publishPullRequest({
        root: fixture.root,
        worktree: fixture.worktree,
        session: 'owner-1',
        apply: true,
        gh: fakeGh({ ready: null }).gh,
        git: runGit,
      }),
      /gh pr ready 21 failed/,
    )
    const entry = loadLocalState(fixture.root).prs['21']
    assert.equal(entry.phase, 'failed')
    assert.equal(existsSync(resolvePaths(fixture.root).landingLock), false)
    const retry = publishPullRequest({
      root: fixture.root,
      worktree: fixture.worktree,
      session: 'owner-1',
      apply: true,
      gh: fakeGh({ pullRequests: [{ number: 21, state: 'OPEN', isDraft: false, url: 'https://example.test/21', headRefOid: fixture.head }] }).gh,
      git: runGit,
    })
    assert.equal(retry.action, 'updated')
    assert.equal(loadLocalState(fixture.root).prs['21'].phase, 'published')
  } finally {
    cleanup(fixture.root, fixture.remote)
  }
})

test('listBranchPullRequests rejects a failed gh call', () => {
  assert.throws(() => listBranchPullRequests({ root: '/tmp', branch: BRANCH, gh: () => undefined }), /gh pr list/)
  assert.deepEqual(listBranchPullRequests({ root: '/tmp', branch: BRANCH, gh: () => '[]' }), [])
})


test('a missing gh binary routes the publish gates to offline-land and other spawn errors throw', () => {
  const fixture = makeFixture()
  const bin = tempDir('dsh-pr-publish-bin-')
  const blocked = tempDir('dsh-pr-publish-blocked-')
  const saved = process.env.PATH
  try {
    writeReview(fixture.root, fixture.tree)
    const gitPath = spawnSync('which', ['git'], { encoding: 'utf8' }).stdout.trim()
    assert.ok(gitPath !== '', 'git is on PATH')
    symlinkSync(gitPath, join(bin, 'git'))
    process.env.PATH = bin
    assert.equal(ghText(['repo', 'view', '--json', 'nameWithOwner']), undefined)
    const result = publishPullRequest({
      root: fixture.root,
      worktree: fixture.worktree,
      session: 'owner-1',
      apply: true,
      gh: ghText,
      git: runGit,
    })
    assert.equal(result.offlineLand, true)
    assert.equal(result.reason, 'github-unreachable')
    assert.equal(originBranch(fixture.remote, BRANCH), undefined)
    assert.equal(existsSync(resolvePaths(fixture.root).localState), false)

    writeFileSync(join(blocked, 'gh'), '#!/bin/sh\nexit 0\n', { mode: 0o644 })
    process.env.PATH = blocked
    assert.throws(() => ghText(['repo', 'view']), /EACCES|permission denied/i)
  } finally {
    process.env.PATH = saved
    cleanup(fixture.root, fixture.remote, bin, blocked)
  }
})
