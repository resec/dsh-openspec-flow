import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

import {
  finishLocal,
  inspectChangeLock,
  main,
  parseArgs,
  recoverLocal,
  retargetLocal,
  statusLocal,
  verifyLocal,
} from '../scripts/pr-local-land.mjs'
import { loadLocalState, resolvePaths, saveLocalState, updateLocalEntry } from '../scripts/pr-review-watch.mjs'
import { acquireLock, forceRelease, lockStatus } from '../scripts/pr-review-lock.mjs'

const CHANGE = 'widget'
const BRANCH = 'openspec/apply/local-widget-12345678'
const SESSION = 'owner-1'
const TOKEN = 'token-1'

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
  const root = mkdtempSync(join(tmpdir(), 'dsh-pr-local-land-'))
  const remote = mkdtempSync(join(tmpdir(), 'dsh-pr-local-land-remote-'))
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
  const worktree = join(root, '.cache', 'openspec-flow', 'worktrees', `local#${CHANGE}`)
  mkdirSync(join(root, '.cache', 'openspec-flow', 'worktrees'), { recursive: true })
  mustGit(root, ['worktree', 'add', '-q', '-b', BRANCH, worktree, base])
  mkdirSync(join(worktree, 'openspec', 'changes', CHANGE), { recursive: true })
  writeFileSync(join(worktree, 'openspec', 'changes', CHANGE, '.openspec.yaml'), 'schema: spec-driven\n')
  writeFileSync(join(worktree, 'openspec', 'changes', CHANGE, 'proposal.md'), '# Widget\n')
  writeFileSync(join(worktree, 'feature.txt'), 'feature\n')
  mustGit(worktree, ['add', '.'])
  mustGit(worktree, ['commit', '-qm', 'feature work'])
  const featureHead = mustGit(worktree, ['rev-parse', 'HEAD'])
  const tree = mustGit(worktree, ['rev-parse', 'HEAD^{tree}'])
  const merge = mustGit(root, ['commit-tree', tree, '-p', base, '-m', 'rebase merge'])
  mustGit(root, ['push', '-q', 'origin', `${merge}:refs/heads/main`])
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
    sealedCommit: null,
    status: 'active',
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
    lockToken: null,
    lockPid: null,
  }, null, 2)}\n`)
  const reviewDirectory = join(common, 'openspec-flow', 'review', `local#${CHANGE}`)
  mkdirSync(reviewDirectory, { recursive: true })
  writeFileSync(join(reviewDirectory, 'apply-review.json'), `${JSON.stringify({
    id: 'review-1',
    state: 'passed',
    treeSha: tree,
    findings: [],
  }, null, 2)}\n`)
  saveLocalState(root, {
    schemaVersion: 1,
    prs: {
      12: {
        number: 12,
        change: CHANGE,
        branch: BRANCH,
        head: featureHead,
        tree,
        record: 'local#widget',
        ownerSession: SESSION,
        phase: 'published',
      },
    },
  })
  acquireLock({ root, session: SESSION, token: TOKEN, pr: 12 })
  return { root, remote, base, worktree, featureHead, tree, merge, common }
}

function mergedGh(fixture, overrides = {}) {
  return (args) => {
    if (args[0] === 'pr' && args[1] === 'view') {
      return JSON.stringify({
        number: 12,
        state: 'MERGED',
        isDraft: false,
        headRefOid: fixture.featureHead,
        baseRefName: 'main',
        mergeCommit: { oid: fixture.merge },
        isCrossRepository: false,
        ...overrides,
      })
    }
    if (args[0] === 'api') return 'maintainer'
    return undefined
  }
}

function cleanup(...directories) {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true })
}

function writeLandedManifest(fixture, archiveCommit, tree = fixture.tree) {
  const directory = join(fixture.common, 'openspec-flow', 'landed')
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, `land-${fixture.merge}.json`), `${JSON.stringify({
    change: CHANGE,
    featureTree: tree,
    landCommit: fixture.merge,
    archiveCommit,
    approvedBy: 'user',
  }, null, 2)}\n`)
}

function simulateArchive(fixture) {
  mustGit(fixture.root, ['reset', '-q', '--hard', fixture.merge])
  mustGit(fixture.root, ['commit', '--allow-empty', '-qm', 'chore(openspec): archive widget'])
  const archiveCommit = mustGit(fixture.root, ['rev-parse', 'HEAD'])
  writeLandedManifest(fixture, archiveCommit)
  return archiveCommit
}

test('parseArgs and help are strict', () => {
  assert.equal(parseArgs(['--help']).command, 'help')
  assert.equal(parseArgs(['status']).command, 'status')
  assert.equal(parseArgs(['status', '12']).number, 12)
  assert.equal(parseArgs(['verify', '12', '--session', SESSION]).session, SESSION)
  assert.equal(parseArgs(['retarget', '12', '--session', SESSION, '--apply']).apply, true)
  assert.equal(parseArgs(['finish', '12', '--session', SESSION, '--phase', 'landed-offline']).phase, 'landed-offline')
  assert.equal(parseArgs(['finish', '12', '--session', SESSION]).phase, 'pushed')
  assert.throws(() => parseArgs(['retarget', '12']), /needs --session/)
  assert.throws(() => parseArgs(['finish']), /needs one PR number/)
  assert.throws(() => parseArgs(['verify', '12', '--apply']), /read-only/)
  assert.throws(() => parseArgs(['status', '--apply']), /read-only/)
  assert.throws(() => parseArgs(['recover', '12', '--apply']), /read-only/)
  assert.throws(() => parseArgs(['wat']), /unknown command/)
  let output = ''
  assert.equal(main(['--help'], (text) => { output += text }), 0)
  assert.match(output, /pr-local-land\.mjs/)
  assert.equal(main(['wat'], (text) => { output += text }), 2)
})

test('verify reports the merge commit and refuses each mismatch', () => {
  const fixture = makeFixture()
  try {
    const facts = verifyLocal({ root: fixture.root, number: 12, session: SESSION, gh: mergedGh(fixture), git: runGit })
    assert.equal(facts.mergeCommit, fixture.merge)
    assert.equal(facts.mergeTree, fixture.tree)
    assert.equal(facts.change, CHANGE)
    assert.equal(facts.worktree, fixture.worktree)
    assert.throws(
      () => verifyLocal({ root: fixture.root, number: 12, session: 'other', gh: mergedGh(fixture), git: runGit }),
      /belongs to session owner-1/,
    )
    assert.throws(
      () => verifyLocal({ root: fixture.root, number: 12, gh: mergedGh(fixture, { state: 'OPEN' }), git: runGit }),
      /not merged/,
    )
    const next = mustGit(fixture.root, ['commit-tree', fixture.tree, '-p', fixture.merge, '-m', 'origin moved'])
    mustGit(fixture.root, ['push', '-q', 'origin', `${next}:refs/heads/main`])
    assert.throws(
      () => verifyLocal({ root: fixture.root, number: 12, gh: mergedGh(fixture), git: runGit }),
      /not the merge commit/,
    )
    mustGit(fixture.root, ['push', '-q', '--force', 'origin', `${fixture.merge}:refs/heads/main`])
  } finally {
    cleanup(fixture.root, fixture.remote)
  }
})

test('verify refuses a tree mismatch, a dirty worktree, a non-ancestor main and a pushed entry', () => {
  const fixture = makeFixture()
  try {
    const gh = mergedGh(fixture)
    const verify = () => verifyLocal({ root: fixture.root, number: 12, gh, git: runGit })
    writeFileSync(join(fixture.worktree, 'dirty.txt'), 'dirty\n')
    assert.throws(verify, /not clean/)
    rmSync(join(fixture.worktree, 'dirty.txt'))
    writeFileSync(join(fixture.common, 'openspec-flow', 'review', `local#${CHANGE}`, 'apply-review.json'), JSON.stringify({
      id: 'review-1', state: 'passed', treeSha: 'f'.repeat(40), findings: [],
    }))
    assert.throws(verify, /does not match/)
    writeFileSync(join(fixture.common, 'openspec-flow', 'review', `local#${CHANGE}`, 'apply-review.json'), JSON.stringify({
      id: 'review-1', state: 'passed', treeSha: fixture.tree, findings: [],
    }))
    updateLocalEntry(fixture.root, 12, { tree: 'f'.repeat(40) })
    assert.throws(verify, /differs from the reviewed tree/)
    updateLocalEntry(fixture.root, 12, { tree: fixture.tree })
    mustGit(fixture.root, ['commit', '--allow-empty', '-qm', 'local main moved'])
    assert.throws(verify, /not an ancestor/)
    updateLocalEntry(fixture.root, 12, { phase: 'pushed' })
    assert.throws(verify, /already pushed/)
  } finally {
    cleanup(fixture.root, fixture.remote)
  }
})

test('retarget resets the worktree to the merge commit and records the phases', () => {
  const fixture = makeFixture()
  try {
    const gh = mergedGh(fixture)
    assert.throws(
      () => retargetLocal({ root: fixture.root, number: 12, session: 'other', token: TOKEN, apply: true, gh, git: runGit }),
      /belongs to session owner-1/,
    )
    assert.equal(loadLocalState(fixture.root).prs['12'].phase, 'published')
    assert.throws(
      () => retargetLocal({ root: fixture.root, number: 12, session: SESSION, token: 'wrong', apply: true, gh, git: runGit }),
      /recorded --token/,
    )
    assert.equal(loadLocalState(fixture.root).prs['12'].phase, 'published')
    const dry = retargetLocal({ root: fixture.root, number: 12, session: SESSION, token: TOKEN, gh, git: runGit })
    assert.equal(dry.dryRun, true)
    assert.equal(mustGit(fixture.worktree, ['rev-parse', 'HEAD']), fixture.featureHead)
    const retargeted = retargetLocal({ root: fixture.root, number: 12, session: SESSION, token: TOKEN, apply: true, gh, git: runGit })
    assert.equal(retargeted.phase, 'retargeted')
    assert.equal(mustGit(fixture.worktree, ['rev-parse', 'HEAD']), fixture.merge)
    assert.equal(mustGit(fixture.worktree, ['rev-parse', 'HEAD^{tree}']), fixture.tree)
    assert.equal(mustGit(fixture.worktree, ['status', '--porcelain']), '')
    assert.equal(loadLocalState(fixture.root).prs['12'].phase, 'retargeted')
    assert.equal(lockStatus({ root: fixture.root }).ownerSession, SESSION)
    const again = retargetLocal({ root: fixture.root, number: 12, session: SESSION, token: TOKEN, apply: true, gh, git: runGit })
    assert.equal(again.alreadyRetargeted, true)
  } finally {
    cleanup(fixture.root, fixture.remote)
  }
})

test('a failed retarget records failed and can be retried', () => {
  const fixture = makeFixture()
  try {
    const gh = mergedGh(fixture)
    writeFileSync(join(fixture.worktree, 'dirty.txt'), 'dirty\n')
    assert.throws(
      () => retargetLocal({ root: fixture.root, number: 12, session: SESSION, token: TOKEN, apply: true, gh, git: runGit }),
      /not clean/,
    )
    assert.equal(loadLocalState(fixture.root).prs['12'].phase, 'failed')
    rmSync(join(fixture.worktree, 'dirty.txt'))
    const retried = retargetLocal({ root: fixture.root, number: 12, session: SESSION, token: TOKEN, apply: true, gh, git: runGit })
    assert.equal(retried.phase, 'retargeted')
  } finally {
    cleanup(fixture.root, fixture.remote)
  }
})

test('finish records landed-offline, releases the lock and then records pushed', () => {
  const fixture = makeFixture()
  try {
    const gh = mergedGh(fixture)
    retargetLocal({ root: fixture.root, number: 12, session: SESSION, token: TOKEN, apply: true, gh, git: runGit })
    const archiveCommit = simulateArchive(fixture)
    assert.throws(
      () => finishLocal({
        root: fixture.root, number: 12, phase: 'landed-offline', session: 'other', token: TOKEN, apply: true, gh, git: runGit,
      }),
      /belongs to session owner-1/,
    )
    const offline = finishLocal({
      root: fixture.root, number: 12, phase: 'landed-offline', session: SESSION, token: TOKEN, apply: true, gh, git: runGit,
    })
    assert.equal(offline.phase, 'landed-offline')
    assert.equal(loadLocalState(fixture.root).prs['12'].phase, 'landed-offline')
    assert.equal(lockStatus({ root: fixture.root }).held, false)
    assert.throws(
      () => finishLocal({
        root: fixture.root, number: 12, phase: 'pushed', session: SESSION, token: TOKEN, apply: true, gh, git: runGit,
      }),
      /not pushed/,
    )
    assert.equal(loadLocalState(fixture.root).prs['12'].phase, 'failed')
    mustGit(fixture.root, ['push', '-q', 'origin', 'main'])
    assert.equal(mustGit(fixture.root, ['rev-parse', 'HEAD']), archiveCommit)
    const pushed = finishLocal({
      root: fixture.root, number: 12, phase: 'pushed', session: SESSION, token: TOKEN, apply: true, gh, git: runGit,
    })
    assert.equal(pushed.phase, 'pushed')
    assert.equal(loadLocalState(fixture.root).prs['12'].phase, 'pushed')
    const again = finishLocal({
      root: fixture.root, number: 12, phase: 'pushed', session: SESSION, token: TOKEN, apply: true, gh, git: runGit,
    })
    assert.equal(again.phase, 'pushed')
  } finally {
    cleanup(fixture.root, fixture.remote)
  }
})


test('finish records a published pull-request fallback as landed-offline and pushed', () => {
  const fixture = makeFixture()
  try {
    const gh = mergedGh(fixture)
    mustGit(fixture.root, ['push', '-q', '--force', 'origin', `${fixture.base}:refs/heads/main`])
    mustGit(fixture.root, ['reset', '-q', '--hard', fixture.featureHead])
    mustGit(fixture.root, ['commit', '--allow-empty', '-qm', 'chore(openspec): archive widget'])
    const archiveCommit = mustGit(fixture.root, ['rev-parse', 'HEAD'])
    writeLandedManifest(fixture, archiveCommit)
    const offline = finishLocal({
      root: fixture.root, number: 12, phase: 'landed-offline', session: SESSION, token: TOKEN, apply: true, gh, git: runGit,
    })
    assert.equal(offline.phase, 'landed-offline')
    mustGit(fixture.root, ['push', '-q', 'origin', 'main'])
    const pushed = finishLocal({
      root: fixture.root, number: 12, phase: 'pushed', session: SESSION, token: TOKEN, apply: true, gh, git: runGit,
    })
    assert.equal(pushed.phase, 'pushed')
  } finally {
    cleanup(fixture.root, fixture.remote)
  }
})

test('finish refuses a missing manifest and a main that is not the archive commit', () => {
  const fixture = makeFixture()
  try {
    const gh = mergedGh(fixture)
    retargetLocal({ root: fixture.root, number: 12, session: SESSION, token: TOKEN, apply: true, gh, git: runGit })
    mustGit(fixture.root, ['reset', '-q', '--hard', fixture.merge])
    mustGit(fixture.root, ['commit', '--allow-empty', '-qm', 'archive without manifest'])
    assert.throws(
      () => finishLocal({
        root: fixture.root, number: 12, phase: 'landed-offline', session: SESSION, token: TOKEN, apply: true, gh, git: runGit,
      }),
      /no landed manifest/,
    )
    assert.equal(loadLocalState(fixture.root).prs['12'].phase, 'failed')
    const archiveCommit = mustGit(fixture.root, ['rev-parse', 'HEAD'])
    writeLandedManifest(fixture, archiveCommit)
    mustGit(fixture.root, ['commit', '--allow-empty', '-qm', 'later main commit'])
    assert.throws(
      () => finishLocal({
        root: fixture.root, number: 12, phase: 'landed-offline', session: SESSION, token: TOKEN, apply: true, gh, git: runGit,
      }),
      /not the landed archive commit/,
    )
    assert.equal(loadLocalState(fixture.root).prs['12'].phase, 'failed')
  } finally {
    cleanup(fixture.root, fixture.remote)
  }
})

test('recover plans the plugin lock recovery, retarget, land, push and finish', () => {
  const fixture = makeFixture()
  try {
    const gh = mergedGh(fixture)
    const deadLock = join(fixture.common, 'openspec-flow', 'changes', `local#${CHANGE}.lock.d`)
    mkdirSync(deadLock, { recursive: true })
    writeFileSync(join(deadLock, 'owner'), `${JSON.stringify({ pid: 999999, token: 'dead-token' })}\n`)
    const plan = recoverLocal({ root: fixture.root, number: 12, gh, git: runGit })
    assert.equal(plan.merged, true)
    assert.equal(plan.treeMatches, true)
    assert.equal(plan.changeLock.state, 'dead')
    assert.match(plan.steps[0], /openspec_apply_worktree action=recover scope=change expectedOwner=dead-token/)
    assert.ok(plan.steps.some((step) => step.includes('pr-local-land.mjs retarget 12 --session owner-1 --apply')))
    assert.ok(plan.steps.some((step) => step.includes('openspec_apply_worktree action=land')))
    assert.ok(plan.steps.some((step) => step.includes('scripts/push-landed.mjs --push')))
    assert.ok(plan.steps.some((step) => step.includes('finish 12 --phase pushed --session owner-1 --apply')))
    writeFileSync(join(deadLock, 'owner'), `${JSON.stringify({ pid: process.pid, token: 'live-token' })}\n`)
    assert.equal(inspectChangeLock(fixture.root, { change: CHANGE, store: null }).state, 'alive')
    assert.throws(() => recoverLocal({ root: fixture.root, number: 12, gh, git: runGit }), /live process/)
  } finally {
    cleanup(fixture.root, fixture.remote)
  }
})

test('status reports the local entry without writing', () => {
  const fixture = makeFixture()
  try {
    const gh = mergedGh(fixture)
    const before = readFileSync(resolvePaths(fixture.root).localState, 'utf8')
    const report = statusLocal({ root: fixture.root, number: 12, gh, git: runGit })
    assert.equal(report.number, 12)
    assert.equal(report.phase, 'published')
    assert.equal(report.pullRequest.state, 'MERGED')
    assert.equal(report.ownerSession, SESSION)
    assert.equal(report.changeLock.state, 'missing')
    assert.equal(report.landed, null)
    assert.equal(readFileSync(resolvePaths(fixture.root).localState, 'utf8'), before)
    const list = statusLocal({ root: fixture.root, gh, git: runGit })
    assert.deepEqual(list.entries.map((entry) => entry.number), [12])
    forceRelease({ root: fixture.root, reason: 'test cleanup' })
  } finally {
    cleanup(fixture.root, fixture.remote)
  }
})

test('inspectChangeLock reports missing, corrupt and dead owners', () => {
  const fixture = makeFixture()
  try {
    const state = { change: CHANGE, store: null }
    assert.equal(inspectChangeLock(fixture.root, state).state, 'missing')
    const directory = join(fixture.common, 'openspec-flow', 'changes', `local#${CHANGE}.lock.d`)
    mkdirSync(directory, { recursive: true })
    writeFileSync(join(directory, 'owner'), '{bad json')
    assert.equal(inspectChangeLock(fixture.root, state).state, 'corrupt')
    writeFileSync(join(directory, 'owner'), JSON.stringify({ pid: 999999, token: 'dead' }))
    assert.equal(inspectChangeLock(fixture.root, state).state, 'dead')
    assert.equal(existsSync(directory), true)
  } finally {
    cleanup(fixture.root, fixture.remote)
  }
})
