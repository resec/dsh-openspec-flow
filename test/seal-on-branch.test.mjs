import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import {
  CHANGE, call, cleanupFixtures, gitFixture, passDraftConstructing, report, reviewDir, setup,
} from './review-fixtures.mjs'
import { readApplyState } from '../lib/worktree/state.js'
import { buildSealCommit, pinSeal, removeSealRef, sealBranchName, sealRefName } from '../lib/worktree/seal.js'

test.after(cleanupFixtures)

const worktreeApply = (root) => setup(root, undefined, { worktree: { enabled: true } })
const runBranch = (root) => spawnSync('git', ['-C', root, 'branch', '-M', 'main'])
const REF = sealRefName(null, CHANGE)

test('a worktree apply seals on the branch without moving main', async () => {
  const { root, run } = gitFixture()
  const fake = worktreeApply(root)
  const head = run(['rev-parse', 'HEAD'])
  await passDraftConstructing(fake, root)
  const state = readApplyState(root, null, CHANGE)
  assert.equal(run(['rev-parse', 'HEAD']), head)
  assert.notEqual(state.baseCommit, head)
  assert.equal(state.sealedCommit, state.baseCommit)
  assert.equal(run(['rev-parse', REF]), state.baseCommit)
  assert.equal(run(['rev-parse', `refs/heads/${state.branch}`]), state.baseCommit)
  assert.equal(run(['rev-parse', `${state.baseCommit}^1`]), head)
  const record = JSON.parse(readFileSync(join(reviewDir(root), 'review.json'), 'utf8'))
  assert.equal(record.applyBaseCommit, state.baseCommit)
  assert.match(run(['status', '--porcelain']), new RegExp(`openspec/changes/${CHANGE}`))
})

test('the seal stages the uncommitted ignore file and refuses outside dirt', async () => {
  const { root, run } = gitFixture()
  const fake = worktreeApply(root)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  await call(fake, 'openspec_review', { action: 'self-report', change: CHANGE, report: report() })
  writeFileSync(join(root, 'openspec', '.gitignore'), '.review/\n')
  writeFileSync(join(root, 'outside.txt'), 'outside\n')
  await assert.rejects(call(fake, 'openspec_apply_next', { change: CHANGE }), /working tree is not clean/)
  assert.equal(readApplyState(root, null, CHANGE), undefined)
  rmSync(join(root, 'outside.txt'))
  await call(fake, 'openspec_apply_next', { change: CHANGE })
  const state = readApplyState(root, null, CHANGE)
  assert.equal(run(['show', `${state.baseCommit}:openspec/.gitignore`]), '.review/')
})

test('a changed plan leaves no seal ref or branch', async () => {
  const { root, run } = gitFixture()
  const fake = worktreeApply(root)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  await call(fake, 'openspec_review', { action: 'self-report', change: CHANGE, report: report() })
  writeFileSync(join(root, 'openspec', 'changes', CHANGE, 'proposal.md'), '# Changed after the draft\n')
  await assert.rejects(
    call(fake, 'openspec_apply_next', { change: CHANGE }),
    /changed since the review started|differ from the reviewed draft/,
  )
  assert.equal(readApplyState(root, null, CHANGE), undefined)
  assert.notEqual(spawnSync('git', ['-C', root, 'rev-parse', '--verify', '--quiet', REF]).status, 0)
  assert.notEqual(spawnSync('git', ['-C', root, 'rev-parse', '--verify', '--quiet', `refs/heads/${sealBranchName(null, CHANGE)}`]).status, 0)
})

test('a resync tolerates a missing main planning copy', async () => {
  const { root } = gitFixture()
  const fake = worktreeApply(root)
  await passDraftConstructing(fake, root)
  rmSync(join(root, 'openspec', 'changes', CHANGE), { recursive: true, force: true })
  const resync = await call(fake, 'openspec_apply_next', { change: CHANGE })
  assert.equal(resync.change, CHANGE)
  assert.equal(typeof resync.state, 'string')
})

test('a rebase rewrites the branch seal and keeps the recorded base', async () => {
  const { root, run } = gitFixture()
  run(['branch', '-M', 'main'])
  const fake = worktreeApply(root)
  await passDraftConstructing(fake, root)
  const state = readApplyState(root, null, CHANGE)
  writeFileSync(join(state.worktree, 'feature.txt'), 'feature\n')
  run(['-C', state.worktree, 'add', 'feature.txt'])
  run(['-C', state.worktree, 'commit', '-m', 'feature work'])
  run(['commit', '--allow-empty', '-m', 'another land'])
  run(['-C', state.worktree, 'rebase', 'main'])
  assert.notEqual(run(['-C', state.worktree, 'rev-parse', 'HEAD^']), state.sealedCommit)
  assert.equal(run(['cat-file', '-t', state.sealedCommit]), 'commit')
  const started = await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  assert.equal(started.baseTreeSha, run(['rev-parse', `${state.sealedCommit}^{tree}`]))
  const diff = readFileSync(join(reviewDir(root), 'apply-round-1', 'diff.patch'), 'utf8')
  assert.match(diff, /feature\.txt/)
})

test('the seal resets a stale apply branch and refuses an attached worktree', async () => {
  const { root, run } = gitFixture()
  const branch = sealBranchName(null, CHANGE)
  run(['branch', branch, 'HEAD'])
  const commit = buildSealCommit({
    root,
    changePath: `openspec/changes/${CHANGE}`,
    change: CHANGE,
  })
  pinSeal({ root, store: null, change: CHANGE, commit })
  assert.equal(run(['rev-parse', `refs/heads/${branch}`]), commit)
  assert.equal(run(['rev-parse', sealRefName(null, CHANGE)]), commit)
  const attached = join(root, '..', `${root.split('/').pop()}-attached`)
  run(['worktree', 'add', attached, branch])
  try {
    assert.throws(
      () => pinSeal({ root, store: null, change: CHANGE, commit }),
      /checked out by a worktree/,
    )
  } finally {
    run(['worktree', 'remove', '--force', attached])
  }
})

test('land deletes the seal ref and leaves main clean', async () => {
  const { root, run } = gitFixture()
  run(['branch', '-M', 'main'])
  const fake = worktreeApply(root)
  await passDraftConstructing(fake, root)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, review: 'apply', report: report(),
  })
  assert.equal(run(['rev-parse', '--verify', REF]).length > 0, true)
  const landed = await call(fake, 'openspec_apply_worktree', {
    action: 'land', change: CHANGE, approvedBy: 'user',
  })
  assert.equal(landed.cleanup.complete, true)
  assert.notEqual(spawnSync('git', ['-C', root, 'rev-parse', '--verify', '--quiet', REF]).status, 0)
  assert.equal(run(['status', '--porcelain']), '')
})

test('the seal ref is valid for a double dot and a leading dot', () => {
  for (const [store, change] of [[null, 'release..1'], ['team-store', CHANGE], ['.dot', CHANGE]]) {
    const name = sealRefName(store, change)
    assert.equal(spawnSync('git', ['check-ref-format', name]).status, 0, name)
  }
  assert.match(sealRefName(null, 'release..1'), /seal\/local-release--1-/)
  assert.match(sealRefName('.dot', CHANGE), /seal\/-dot-/)
})

test('land restores the planning copy when it fails before the merge', async () => {
  const { root, run } = gitFixture()
  run(['branch', '-M', 'main'])
  const fake = worktreeApply(root)
  await passDraftConstructing(fake, root)
  const state = readApplyState(root, null, CHANGE)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, review: 'apply', report: report(),
  })
  writeFileSync(join(state.worktree, 'dirty.txt'), 'dirty\n')
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }),
    /clean worktree/,
  )
  assert.equal(run(['rev-parse', 'HEAD']) !== state.baseCommit, true)
  assert.equal(readFileSync(join(root, 'openspec', 'changes', CHANGE, 'proposal.md'), 'utf8').length > 0, true)
  assert.match(run(['status', '--porcelain']), new RegExp(`openspec/changes/${CHANGE}`))
})

test('land restores a tracked modified ignore file and the fast-forward updates it', async () => {
  const { root, run } = gitFixture()
  run(['branch', '-M', 'main'])
  writeFileSync(join(root, 'openspec', '.gitignore'), '.review/\n')
  run(['add', 'openspec/.gitignore'])
  run(['commit', '-m', 'track the ignore file'])
  const fake = worktreeApply(root)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, report: report(),
  })
  writeFileSync(join(root, 'openspec', '.gitignore'), '.review/\n# docs\n')
  await call(fake, 'openspec_apply_next', { change: CHANGE })
  const state = readApplyState(root, null, CHANGE)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, review: 'apply', report: report(),
  })
  await call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' })
  assert.equal(run(['show', 'HEAD:openspec/.gitignore']), '.review/\n# docs')
  assert.equal(run(['status', '--porcelain']), '')
  assert.equal(state.baseCommit.length, 40)
})

test('remove deletes the seal ref and keeps the branch', async () => {
  const { root, run } = gitFixture()
  const fake = worktreeApply(root)
  await passDraftConstructing(fake, root)
  const state = readApplyState(root, null, CHANGE)
  assert.equal(run(['rev-parse', REF]), state.baseCommit)
  await call(fake, 'openspec_apply_worktree', {
    action: 'remove', change: CHANGE, abandon: true, approvedBy: 'user', reason: 'abandoned for a test',
  })
  assert.notEqual(spawnSync('git', ['-C', root, 'rev-parse', '--verify', '--quiet', REF]).status, 0)
  assert.equal(run(['rev-parse', `refs/heads/${state.branch}`]), state.baseCommit)
})

async function readyLand(root) {
  const fake = worktreeApply(root)
  await passDraftConstructing(fake, root)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, review: 'apply', report: report(),
  })
  return fake
}

test('land refuses a main copy that differs from the seal', async () => {
  const { root } = gitFixture()
  runBranch(root)
  const fake = await readyLand(root)
  writeFileSync(join(root, 'openspec', 'changes', CHANGE, 'proposal.md'), '# Changed in main\n')
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }),
    /differs from the seal/,
  )
})

test('land refuses a main file that is not in the seal', async () => {
  const { root } = gitFixture()
  runBranch(root)
  const fake = await readyLand(root)
  writeFileSync(join(root, 'openspec', 'changes', CHANGE, 'extra.md'), 'extra\n')
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }),
    /not in the seal/,
  )
})

test('land restores a tracked deleted ignore file', async () => {
  const { root, run } = gitFixture()
  run(['branch', '-M', 'main'])
  writeFileSync(join(root, 'openspec', '.gitignore'), '.review/\n')
  run(['add', 'openspec/.gitignore'])
  run(['commit', '-m', 'track the ignore file'])
  const fake = await readyLand(root)
  rmSync(join(root, 'openspec', '.gitignore'))
  const landed = await call(fake, 'openspec_apply_worktree', {
    action: 'land', change: CHANGE, approvedBy: 'user',
  })
  assert.equal(landed.cleanup.complete, true)
  assert.equal(readFileSync(join(root, 'openspec', '.gitignore'), 'utf8'), '.review/\n')
})

test('land refuses a tracked ignore file that differs from the seal', async () => {
  const { root, run } = gitFixture()
  run(['branch', '-M', 'main'])
  writeFileSync(join(root, 'openspec', '.gitignore'), '.review/\n')
  run(['add', 'openspec/.gitignore'])
  run(['commit', '-m', 'track the ignore file'])
  const fake = await readyLand(root)
  writeFileSync(join(root, 'openspec', '.gitignore'), '.review/\n# later edit\n')
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }),
    /differs from the seal/,
  )
})

test('a branch that does not point at the seal is refused on re-apply', async () => {
  const { root, run } = gitFixture()
  const fake = worktreeApply(root)
  await passDraftConstructing(fake, root)
  const state = readApplyState(root, null, CHANGE)
  await call(fake, 'openspec_apply_worktree', {
    action: 'remove', change: CHANGE, abandon: true, approvedBy: 'user', reason: 'restart',
  })
  run(['branch', '-f', state.branch, 'HEAD'])
  const second = worktreeApply(root)
  await assert.rejects(
    call(second, 'openspec_apply_next', { change: CHANGE }),
    /does not point at the seal commit/,
  )
})

test('land removes an untracked ignore file staged by the seal', async () => {
  const { root, run } = gitFixture()
  run(['branch', '-M', 'main'])
  writeFileSync(join(root, 'openspec', '.gitignore'), '.review/\n')
  const fake = await readyLand(root)
  const landed = await call(fake, 'openspec_apply_worktree', {
    action: 'land', change: CHANGE, approvedBy: 'user',
  })
  assert.equal(landed.cleanup.complete, true)
  assert.equal(run(['status', '--porcelain']), '')
  assert.equal(readFileSync(join(root, 'openspec', '.gitignore'), 'utf8'), '.review/\n')
})

test('land restores a tracked modified ignore file when it fails', async () => {
  const { root, run } = gitFixture()
  run(['branch', '-M', 'main'])
  writeFileSync(join(root, 'openspec', '.gitignore'), '.review/\n')
  run(['add', 'openspec/.gitignore'])
  run(['commit', '-m', 'track the ignore file'])
  writeFileSync(join(root, 'openspec', '.gitignore'), '.review/\n# docs\n')
  const fake = await readyLand(root)
  const state = readApplyState(root, null, CHANGE)
  writeFileSync(join(state.worktree, 'dirty.txt'), 'dirty\n')
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }),
    /clean worktree/,
  )
  assert.equal(readFileSync(join(root, 'openspec', '.gitignore'), 'utf8'), '.review/\n# docs\n')
  assert.match(run(['status', '--porcelain']), /M openspec\/\.gitignore/)
})

test('removing a missing seal ref is a no-op', async () => {
  const { root } = gitFixture()
  removeSealRef(root, null, CHANGE)
  removeSealRef(root, null, CHANGE)
})
