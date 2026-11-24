import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { CHANGE, cleanupFixtures, gitFixture, passDraft, report, setup, call } from './review-fixtures.mjs'
import { readApplyState } from '../lib/worktree/state.js'
import { manifestPath } from '../lib/worktree/land.js'
import { finishLocal, retargetLocal, verifyLocal } from '../scripts/pr-local-land.mjs'
import { saveLocalState } from '../scripts/pr-review-watch.mjs'
import { acquireLock, forceRelease, lockStatus } from '../scripts/pr-review-lock.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const PUSH_LANDED = join(ROOT, 'scripts', 'push-landed.mjs')
const SESSION = 'owner-1'
const TOKEN = 'token-1'
const NUMBER = 12

test.after(cleanupFixtures)

function git(cwd, args) {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

function makeOrigin(root) {
  const remote = mkdtempSync(join(tmpdir(), 'dsh-local-pr-origin-'))
  git(remote, ['init', '--bare', '-q'])
  git(root, ['remote', 'add', 'origin', remote])
  git(root, ['push', '-q', '-u', 'origin', 'main'])
  return remote
}

async function reviewedFixture() {
  const { root, run } = gitFixture()
  run(['branch', '-M', 'main'])
  writeFileSync(join(root, '.gitignore'), '.cache/\n')
  run(['add', '.gitignore'])
  run(['commit', '-qm', 'ignore the local cache'])
  const remote = makeOrigin(root)
  const fake = setup(root, undefined, { worktree: { enabled: true } })
  await passDraft(fake, root, run)
  const state = readApplyState(root, null, CHANGE)
  writeFileSync(join(state.worktree, 'feature.txt'), 'feature\n')
  run(['-C', state.worktree, 'add', 'feature.txt'])
  run(['-C', state.worktree, 'commit', '-qm', 'feature work'])
  const featureHead = run(['-C', state.worktree, 'rev-parse', 'HEAD'])
  const tree = run(['-C', state.worktree, 'rev-parse', 'HEAD^{tree}'])
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, review: 'apply', report: report(),
  })
  const base = run(['rev-parse', 'HEAD'])
  const merge = run(['commit-tree', tree, '-p', base, '-m', 'rebase merge'])
  run(['push', '-q', 'origin', `${merge}:refs/heads/main`])
  run(['fetch', '-q', 'origin', 'main'])
  saveLocalState(root, {
    schemaVersion: 1,
    prs: {
      [NUMBER]: {
        number: NUMBER,
        change: CHANGE,
        branch: state.branch,
        head: featureHead,
        tree,
        record: `local#${CHANGE}`,
        ownerSession: SESSION,
        phase: 'published',
      },
    },
  })
  acquireLock({ root, session: SESSION, token: TOKEN, pr: NUMBER })
  run(['config', 'core.hooksPath', join(root, '.no-hooks')])
  const gh = (args) => {
    if (args[0] === 'pr' && args[1] === 'view') {
      return JSON.stringify({
        number: NUMBER,
        state: 'MERGED',
        isDraft: false,
        headRefOid: featureHead,
        baseRefName: 'main',
        mergeCommit: { oid: merge },
        isCrossRepository: false,
      })
    }
    if (args[0] === 'api') return 'maintainer'
    return undefined
  }
  return { root, remote, run, fake, state, featureHead, tree, merge, gh }
}

function pushLanded(root, args = []) {
  return spawnSync(process.execPath, [PUSH_LANDED, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env },
  })
}

function cleanup(...directories) {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true })
}

test('retarget, land, archive and the explicit push complete the reviewed tree online', async () => {
  const fixture = await reviewedFixture()
  try {
    assert.equal(verifyLocal({ root: fixture.root, number: NUMBER, gh: fixture.gh }).mergeCommit, fixture.merge)
    const retargeted = retargetLocal({
      root: fixture.root,
      number: NUMBER,
      session: SESSION,
      token: TOKEN,
      apply: true,
      gh: fixture.gh,
    })
    assert.equal(retargeted.phase, 'retargeted')
    assert.equal(fixture.run(['-C', fixture.state.worktree, 'rev-parse', 'HEAD']), fixture.merge)
    assert.equal(fixture.run(['-C', fixture.state.worktree, 'rev-parse', 'HEAD^{tree}']), fixture.tree)
    const landed = await call(fixture.fake, 'openspec_apply_worktree', {
      action: 'land', change: CHANGE, approvedBy: 'user',
    })
    assert.equal(landed.landCommit, fixture.merge)
    assert.equal(landed.cleanup.complete, true)
    assert.equal(existsSync(fixture.state.worktree), false)
    const manifest = JSON.parse(readFileSync(manifestPath(fixture.root, fixture.merge), 'utf8'))
    assert.equal(manifest.change, CHANGE)
    assert.equal(manifest.featureTree, fixture.tree)
    assert.equal(manifest.landCommit, fixture.merge)
    assert.equal(fixture.run(['rev-parse', 'HEAD']), manifest.archiveCommit)
    assert.equal(fixture.run(['rev-parse', `${manifest.archiveCommit}^1`]), fixture.merge)
    assert.equal(fixture.run(['rev-parse', 'origin/main']), fixture.merge)

    const offline = finishLocal({
      root: fixture.root,
      number: NUMBER,
      phase: 'landed-offline',
      session: SESSION,
      token: TOKEN,
      apply: true,
      gh: fixture.gh,
    })
    assert.equal(offline.phase, 'landed-offline')
    assert.equal(lockStatus({ root: fixture.root }).held, false)

    const dry = pushLanded(fixture.root)
    assert.equal(dry.status, 0, dry.stderr)
    assert.match(dry.stdout, /dry-run; 1 commit\(s\) would be pushed/)
    assert.match(dry.stdout, new RegExp(manifest.archiveCommit.slice(0, 12)))
    const pushed = pushLanded(fixture.root, ['--push'])
    assert.equal(pushed.status, 0, pushed.stderr)
    assert.match(pushed.stdout, /pushed 1 commit\(s\)/)
    assert.equal(fixture.run(['rev-parse', 'origin/main']), manifest.archiveCommit)
    const finished = finishLocal({
      root: fixture.root,
      number: NUMBER,
      phase: 'pushed',
      session: SESSION,
      token: TOKEN,
      apply: true,
      gh: fixture.gh,
    })
    assert.equal(finished.phase, 'pushed')
    assert.equal(readApplyState(fixture.root, null, CHANGE).status, 'archived')
  } finally {
    cleanup(fixture.root, fixture.remote)
  }
})

test('a land without the retarget diverges and the push is refused', async () => {
  const fixture = await reviewedFixture()
  try {
    const landed = await call(fixture.fake, 'openspec_apply_worktree', {
      action: 'land', change: CHANGE, approvedBy: 'user',
    })
    assert.equal(landed.landCommit, fixture.featureHead)
    assert.notEqual(landed.landCommit, fixture.merge)
    assert.equal(fixture.run(['rev-parse', 'origin/main']), fixture.merge)
    assert.throws(
      () => verifyLocal({ root: fixture.root, number: NUMBER, gh: fixture.gh }),
      /is not an ancestor|no plugin worktree/,
    )
    const refused = pushLanded(fixture.root, ['--push'])
    assert.equal(refused.status, 1)
    assert.match(refused.stderr, /diverged/)
    assert.equal(fixture.run(['rev-parse', 'origin/main']), fixture.merge)
    forceRelease({ root: fixture.root, reason: 'test cleanup' })
  } finally {
    cleanup(fixture.root, fixture.remote)
  }
})

test('a retarget refuses an origin/main that moved past the merge commit', async () => {
  const fixture = await reviewedFixture()
  try {
    const moved = fixture.run(['commit-tree', fixture.tree, '-p', fixture.merge, '-m', 'origin moved'])
    fixture.run(['push', '-q', 'origin', `${moved}:refs/heads/main`])
    assert.throws(
      () => retargetLocal({
        root: fixture.root,
        number: NUMBER,
        session: SESSION,
        token: TOKEN,
        apply: true,
        gh: fixture.gh,
      }),
      /not the merge commit/,
    )
    assert.equal(fixture.run(['-C', fixture.state.worktree, 'rev-parse', 'HEAD']), fixture.featureHead)
  } finally {
    cleanup(fixture.root, fixture.remote)
  }
})
