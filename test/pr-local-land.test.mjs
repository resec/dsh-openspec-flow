import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

import {
  adoptLocal,
  finishLocal,
  inspectChangeLock,
  main,
  parseArgs,
  recoverLocal,
  retargetLocal,
  statusLocal,
  verifyLocal,
} from '../scripts/pr-local-land.mjs'
import { readLandedManifestForMain, readLandedManifests } from '../scripts/pr-local-shared.mjs'
import { loadLocalState, resolvePaths, saveLocalState, updateLocalEntry } from '../scripts/pr-review-watch.mjs'
import { acquireLock, forceRelease, lockStatus } from '../scripts/pr-review-lock.mjs'
import { cleanupTempDirs, tempDir } from './temp.mjs'

test.after(cleanupTempDirs)

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
  const root = tempDir('dsh-pr-local-land-')
  const remote = tempDir('dsh-pr-local-land-remote-')
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

function writeLandedManifest(fixture, archiveCommit, tree = fixture.tree, overrides = {}) {
  const directory = join(fixture.common, 'openspec-flow', 'landed')
  mkdirSync(directory, { recursive: true })
  const { file = `land-${fixture.merge}.json`, ...fields } = overrides
  writeFileSync(join(directory, file), `${JSON.stringify({
    change: CHANGE,
    featureHead: fixture.featureHead,
    featureTree: tree,
    landCommit: fixture.merge,
    archiveCommit,
    approvedBy: 'user',
    ...fields,
  }, null, 2)}\n`)
}

function writeReview(fixture, tree, overrides = {}) {
  writeFileSync(join(fixture.common, 'openspec-flow', 'review', `local#${CHANGE}`, 'apply-review.json'), `${JSON.stringify({
    id: 'review-1',
    state: 'passed',
    treeSha: tree,
    findings: [],
    ...overrides,
  }, null, 2)}\n`)
}

function commitWorktreeChange(fixture, content = 're-reviewed\n') {
  writeFileSync(join(fixture.worktree, 'feature.txt'), content)
  mustGit(fixture.worktree, ['add', '.'])
  mustGit(fixture.worktree, ['commit', '-qm', 're-review'])
  return {
    head: mustGit(fixture.worktree, ['rev-parse', 'HEAD']),
    tree: mustGit(fixture.worktree, ['rev-parse', 'HEAD^{tree}']),
  }
}

function removeWorktree(fixture) {
  mustGit(fixture.root, ['worktree', 'remove', '--force', fixture.worktree])
}

function openGh() {
  return (args) => {
    if (args[0] === 'pr' && args[1] === 'view') {
      return JSON.stringify({
        number: 12,
        state: 'OPEN',
        isDraft: false,
        headRefOid: 'f'.repeat(40),
        baseRefName: 'main',
        mergeCommit: null,
        isCrossRepository: false,
      })
    }
    if (args[0] === 'api') return 'maintainer'
    return undefined
  }
}

function noGh() {
  return undefined
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
  const tree = 'a'.repeat(40)
  assert.equal(parseArgs(['adopt', '12', '--tree', tree, '--session', SESSION]).tree, tree)
  assert.equal(parseArgs(['adopt', '12', '--tree', tree, '--session', SESSION]).command, 'adopt')
  assert.throws(() => parseArgs(['adopt', '12', '--session', SESSION]), /needs --tree/)
  assert.throws(() => parseArgs(['adopt', '12', '--tree', 'abc', '--session', SESSION]), /full 40-character/)
  assert.throws(() => parseArgs(['adopt', '12', '--tree', tree]), /needs --session/)
  assert.throws(() => parseArgs(['verify', '12', '--tree', tree]), /only adopt accepts --tree/)
  assert.throws(() => parseArgs(['retarget', '12', '--session', SESSION, '--tree', tree]), /only adopt accepts --tree/)
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
  assert.match(output, /adopt <n> --tree <sha>/)
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
    assert.throws(verify, /differs from the reviewed tree[\s\S]*adopt 12 --tree/)
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
      /token does not match/,
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
      /not pushed.*--offline/,
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



test('retarget and finish accept the recorded owner session without a token', () => {
  const fixture = makeFixture()
  try {
    const gh = mergedGh(fixture)
    const retargeted = retargetLocal({
      root: fixture.root, number: 12, session: SESSION, apply: true, gh, git: runGit,
    })
    assert.equal(retargeted.phase, 'retargeted')
    assert.equal(mustGit(fixture.worktree, ['rev-parse', 'HEAD']), fixture.merge)
    const archiveCommit = simulateArchive(fixture)
    const offline = finishLocal({
      root: fixture.root, number: 12, phase: 'landed-offline', session: SESSION, apply: true, gh, git: runGit,
    })
    assert.equal(offline.phase, 'landed-offline')
    assert.equal(lockStatus({ root: fixture.root }).held, false)
    mustGit(fixture.root, ['push', '-q', 'origin', 'main'])
    assert.equal(mustGit(fixture.root, ['rev-parse', 'HEAD']), archiveCommit)
    const pushed = finishLocal({
      root: fixture.root, number: 12, phase: 'pushed', session: SESSION, apply: true, gh, git: runGit,
    })
    assert.equal(pushed.phase, 'pushed')
    assert.equal(loadLocalState(fixture.root).prs['12'].phase, 'pushed')
  } finally {
    cleanup(fixture.root, fixture.remote)
  }
})

test('recover omits the token when the lock is free and refuses another session', () => {
  const fixture = makeFixture()
  try {
    const gh = mergedGh(fixture)
    forceRelease({ root: fixture.root, reason: 'owner session ended' })
    const free = recoverLocal({ root: fixture.root, number: 12, gh, git: runGit })
    assert.equal(free.lock, null)
    assert.ok(free.steps.some((step) => step.includes('retarget 12 --session owner-1 --apply')))
    assert.equal(free.steps.some((step) => step.includes('--token')), false)
    acquireLock({ root: fixture.root, session: 'other-owner', token: 'other-token', pr: 12 })
    assert.throws(
      () => recoverLocal({ root: fixture.root, number: 12, gh, git: runGit }),
      /held by session other-owner, but the local entry belongs to owner-1/,
    )
    forceRelease({ root: fixture.root, reason: 'test cleanup' })
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
    assert.ok(plan.steps.some((step) => step.includes('pr-local-land.mjs retarget 12 --session owner-1 --token token-1 --apply')))
    assert.ok(plan.steps.some((step) => step.includes('openspec_apply_worktree action=land')))
    assert.ok(plan.steps.some((step) => step.includes('scripts/push-landed.mjs --push')))
    assert.ok(plan.steps.some((step) => step.includes('finish 12 --phase pushed --session owner-1 --token token-1 --apply')))
    assert.deepEqual(plan.lock, { ownerSession: SESSION, pr: 12 })
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

test('landed manifest lookup selects the manifest whose archive commit is main', () => {
  const fixture = makeFixture()
  try {
    const archiveCommit = simulateArchive(fixture)
    writeLandedManifest(fixture, 'a'.repeat(40), 'b'.repeat(40), { file: 'land-stale.json' })
    writeFileSync(join(fixture.common, 'openspec-flow', 'landed', 'land-corrupt.json'), '{bad')
    assert.equal(readLandedManifests(fixture.root).length, 2)
    const found = readLandedManifestForMain(fixture.root, { change: CHANGE, main: archiveCommit })
    assert.equal(found.manifest.featureTree, fixture.tree)
    assert.equal(readLandedManifestForMain(fixture.root, { change: CHANGE, main: 'c'.repeat(40) }), undefined)
    assert.equal(readLandedManifestForMain(fixture.root, { change: 'other', main: archiveCommit }), undefined)
  } finally {
    cleanup(fixture.root, fixture.remote)
  }
})

test('adopt records a re-reviewed worktree tree, keeps the phase and clears the error', () => {
  const fixture = makeFixture()
  try {
    const next = commitWorktreeChange(fixture)
    writeReview(fixture, next.tree)
    updateLocalEntry(fixture.root, 12, { phase: 'failed', error: 'stale tree' })
    const before = readFileSync(resolvePaths(fixture.root).localState, 'utf8')
    const dry = adoptLocal({ root: fixture.root, number: 12, tree: next.tree, session: SESSION, gh: openGh(), git: runGit })
    assert.equal(dry.dryRun, true)
    assert.equal(dry.head, next.head)
    assert.equal(dry.tree, next.tree)
    assert.deepEqual(dry.sources, ['apply worktree'])
    assert.equal(readFileSync(resolvePaths(fixture.root).localState, 'utf8'), before)
    const adopted = adoptLocal({
      root: fixture.root, number: 12, tree: next.tree, session: SESSION, gh: openGh(), git: runGit, apply: true,
    })
    assert.equal(adopted.head, next.head)
    assert.equal(adopted.tree, next.tree)
    assert.equal(adopted.phase, 'failed')
    assert.equal(adopted.error, null)
  } finally {
    cleanup(fixture.root, fixture.remote)
  }
})

test('adopt prefers the merged pull request head over the worktree head', () => {
  const fixture = makeFixture()
  try {
    updateLocalEntry(fixture.root, 12, { tree: 'e'.repeat(40) })
    const report = adoptLocal({
      root: fixture.root, number: 12, tree: fixture.tree, session: SESSION, gh: mergedGh(fixture), git: runGit,
    })
    assert.deepEqual(report.sources, ['merged pull request', 'apply worktree'])
    assert.equal(report.head, fixture.merge)
    const adopted = adoptLocal({
      root: fixture.root, number: 12, tree: fixture.tree, session: SESSION, gh: mergedGh(fixture), git: runGit, apply: true,
    })
    assert.equal(adopted.head, fixture.merge)
    assert.equal(adopted.tree, fixture.tree)
  } finally {
    cleanup(fixture.root, fixture.remote)
  }
})

test('adopt records the landed manifest head over the merged PR and worktree heads', () => {
  const fixture = makeFixture()
  try {
    const archiveCommit = simulateArchive(fixture)
    const alternate = mustGit(fixture.root, ['commit-tree', fixture.tree, '-p', fixture.base, '-m', 'alternate reviewed head'])
    writeLandedManifest(fixture, archiveCommit, fixture.tree, { featureHead: alternate, file: `land-${fixture.merge}.json` })
    updateLocalEntry(fixture.root, 12, { tree: 'e'.repeat(40) })
    const report = adoptLocal({
      root: fixture.root, number: 12, tree: fixture.tree, session: SESSION, gh: mergedGh(fixture), git: runGit,
    })
    assert.equal(report.head, alternate)
    assert.deepEqual(report.sources, ['landed manifest', 'merged pull request', 'apply worktree'])
    const adopted = adoptLocal({
      root: fixture.root, number: 12, tree: fixture.tree, session: SESSION, gh: mergedGh(fixture), git: runGit, apply: true,
    })
    assert.equal(adopted.head, alternate)
    assert.equal(adopted.tree, fixture.tree)
  } finally {
    cleanup(fixture.root, fixture.remote)
  }
})

test('adopt falls back to a landed manifest after the worktree is removed', () => {
  const fixture = makeFixture()
  try {
    simulateArchive(fixture)
    removeWorktree(fixture)
    updateLocalEntry(fixture.root, 12, { tree: 'e'.repeat(40) })
    const adopted = adoptLocal({
      root: fixture.root, number: 12, tree: fixture.tree, session: SESSION, gh: noGh(), git: runGit, apply: true,
    })
    assert.equal(adopted.head, fixture.featureHead)
    assert.equal(adopted.tree, fixture.tree)
    assert.equal(adopted.phase, 'published')
  } finally {
    cleanup(fixture.root, fixture.remote)
  }
})

test('adopt refuses an unpassed review, an open finding, a pushed entry, another owner and another lock owner', () => {
  const fixture = makeFixture()
  try {
    const base = {
      root: fixture.root, number: 12, tree: fixture.tree, session: SESSION, gh: mergedGh(fixture), git: runGit,
    }
    writeReview(fixture, fixture.tree, { state: 'changes-requested' })
    assert.throws(() => adoptLocal(base), /not passed/)
    writeReview(fixture, fixture.tree, { findings: [{ status: 'open' }] })
    assert.throws(() => adoptLocal(base), /open finding/)
    writeReview(fixture, fixture.tree)
    assert.throws(() => adoptLocal({ ...base, tree: 'abc' }), /full 40-character/)
    updateLocalEntry(fixture.root, 12, { phase: 'pushed' })
    assert.throws(() => adoptLocal(base), /already pushed/)
    updateLocalEntry(fixture.root, 12, { phase: 'published' })
    assert.throws(() => adoptLocal({ ...base, session: 'other' }), /belongs to session owner-1/)
    forceRelease({ root: fixture.root, reason: 'test' })
    acquireLock({ root: fixture.root, session: 'other-owner', token: 'other-token', pr: 12 })
    assert.throws(() => adoptLocal(base), /held by session other-owner/)
    forceRelease({ root: fixture.root, reason: 'test cleanup' })
  } finally {
    cleanup(fixture.root, fixture.remote)
  }
})

test('adopt refuses a merged tree that did not land and a manifest naming another tree', () => {
  const fixture = makeFixture()
  try {
    const next = commitWorktreeChange(fixture)
    writeReview(fixture, next.tree)
    assert.throws(
      () => adoptLocal({ root: fixture.root, number: 12, tree: next.tree, session: SESSION, gh: mergedGh(fixture), git: runGit }),
      /merged pull request tree .* is not/,
    )
  } finally {
    cleanup(fixture.root, fixture.remote)
  }
  const manifestFixture = makeFixture()
  try {
    simulateArchive(manifestFixture)
    const next = commitWorktreeChange(manifestFixture)
    writeReview(manifestFixture, next.tree)
    assert.throws(
      () => adoptLocal({
        root: manifestFixture.root, number: 12, tree: next.tree, session: SESSION, gh: openGh(), git: runGit,
      }),
      /landed manifest .* records tree .* not/,
    )
  } finally {
    cleanup(manifestFixture.root, manifestFixture.remote)
  }
})

test('adopt refuses a manifest without a usable feature head or with a mismatched head tree', () => {
  const fixture = makeFixture()
  try {
    const archiveCommit = simulateArchive(fixture)
    updateLocalEntry(fixture.root, 12, { tree: 'e'.repeat(40) })
    writeLandedManifest(fixture, archiveCommit, fixture.tree, {
      featureHead: 'bad', landCommit: '', file: `land-${fixture.merge}.json`,
    })
    assert.throws(
      () => adoptLocal({ root: fixture.root, number: 12, tree: fixture.tree, session: SESSION, gh: noGh(), git: runGit }),
      /no usable feature head/,
    )
    const wrongTree = mustGit(fixture.root, ['rev-parse', `${fixture.base}^{tree}`])
    const wrongHead = mustGit(fixture.root, ['commit-tree', wrongTree, '-p', fixture.base, '-m', 'wrong tree'])
    writeLandedManifest(fixture, archiveCommit, fixture.tree, {
      featureHead: wrongHead, file: `land-${fixture.merge}.json`,
    })
    assert.throws(
      () => adoptLocal({ root: fixture.root, number: 12, tree: fixture.tree, session: SESSION, gh: noGh(), git: runGit }),
      /has tree .* not/,
    )
  } finally {
    cleanup(fixture.root, fixture.remote)
  }
})

test('adopt refuses a merged pull request without a merge commit and falls back when origin/main is not it', () => {
  const fixture = makeFixture()
  try {
    updateLocalEntry(fixture.root, 12, { tree: 'e'.repeat(40) })
    assert.throws(
      () => adoptLocal({
        root: fixture.root, number: 12, tree: fixture.tree, session: SESSION, gh: mergedGh(fixture, { mergeCommit: null }), git: runGit,
      }),
      /no merge commit id/,
    )
  } finally {
    cleanup(fixture.root, fixture.remote)
  }
  const fallback = makeFixture()
  try {
    mustGit(fallback.root, ['push', '-q', '--force', 'origin', `${fallback.base}:refs/heads/main`])
    updateLocalEntry(fallback.root, 12, { tree: 'e'.repeat(40) })
    const report = adoptLocal({
      root: fallback.root, number: 12, tree: fallback.tree, session: SESSION, gh: mergedGh(fallback), git: runGit,
    })
    assert.equal(report.head, fallback.featureHead)
    assert.deepEqual(report.sources, ['apply worktree'])
  } finally {
    cleanup(fallback.root, fallback.remote)
  }
})

test('adopt refuses a tree with no current source', () => {
  const fixture = makeFixture()
  try {
    writeFileSync(join(fixture.worktree, 'dirty.txt'), 'dirty\n')
    assert.throws(
      () => adoptLocal({ root: fixture.root, number: 12, tree: fixture.tree, session: SESSION, gh: openGh(), git: runGit }),
      /not the current worktree head tree/,
    )
    rmSync(join(fixture.worktree, 'dirty.txt'))
    const tree = 'f'.repeat(40)
    writeReview(fixture, tree)
    assert.throws(
      () => adoptLocal({ root: fixture.root, number: 12, tree, session: SESSION, gh: openGh(), git: runGit }),
      /not the current worktree head tree/,
    )
    removeWorktree(fixture)
    assert.throws(
      () => adoptLocal({ root: fixture.root, number: 12, tree, session: SESSION, gh: openGh(), git: runGit }),
      /not the current worktree head tree/,
    )
    assert.throws(
      () => adoptLocal({ root: fixture.root, number: 12, tree, session: SESSION, gh: noGh(), git: runGit }),
      /gh pr view 12 failed/,
    )
  } finally {
    cleanup(fixture.root, fixture.remote)
  }
})

test('adopt reports a skipped fetch and still records the worktree source', () => {
  const fixture = makeFixture()
  try {
    updateLocalEntry(fixture.root, 12, { tree: 'e'.repeat(40) })
    const flakyGit = (cwd, args, allowFailure = false) => {
      if (args[0] === 'fetch' && args[1] === 'origin') return undefined
      return runGit(cwd, args, allowFailure)
    }
    const report = adoptLocal({
      root: fixture.root, number: 12, tree: fixture.tree, session: SESSION, gh: mergedGh(fixture), git: flakyGit,
    })
    assert.ok(report.skipped.some((text) => text.includes('git fetch origin main failed')))
    assert.equal(report.head, fixture.featureHead)
    assert.deepEqual(report.sources, ['apply worktree'])
  } finally {
    cleanup(fixture.root, fixture.remote)
  }
})

test('verify names adopt on a merged-tree mismatch and recover plans it', () => {
  const fixture = makeFixture()
  try {
    updateLocalEntry(fixture.root, 12, { tree: 'f'.repeat(40), phase: 'failed' })
    assert.throws(
      () => verifyLocal({ root: fixture.root, number: 12, gh: mergedGh(fixture), git: runGit }),
      new RegExp(`adopt 12 --tree ${fixture.tree}`),
    )
    const plan = recoverLocal({ root: fixture.root, number: 12, gh: mergedGh(fixture), git: runGit })
    assert.equal(plan.treeMatches, false)
    const adoptStep = plan.steps.findIndex((step) => step.includes(`adopt 12 --tree ${fixture.tree}`))
    const retargetStep = plan.steps.findIndex((step) => step.includes('retarget 12'))
    assert.ok(adoptStep >= 0 && adoptStep < retargetStep)
    writeReview(fixture, fixture.tree, { state: 'changes-requested' })
    assert.throws(
      () => recoverLocal({ root: fixture.root, number: 12, gh: mergedGh(fixture), git: runGit }),
      /not passed/,
    )
  } finally {
    cleanup(fixture.root, fixture.remote)
  }
})

test('finish names adopt when the landed manifest on main records another tree', () => {
  const fixture = makeFixture()
  try {
    simulateArchive(fixture)
    updateLocalEntry(fixture.root, 12, { tree: 'e'.repeat(40) })
    assert.throws(
      () => finishLocal({
        root: fixture.root, number: 12, phase: 'landed-offline', session: SESSION, token: TOKEN, apply: true, gh: mergedGh(fixture), git: runGit,
      }),
      new RegExp(`records tree e+ but .* records ${fixture.tree}.*adopt 12 --tree ${fixture.tree}`),
    )
    assert.equal(loadLocalState(fixture.root).prs['12'].phase, 'failed')
  } finally {
    cleanup(fixture.root, fixture.remote)
  }
})
