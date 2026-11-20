import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'

import { CHANGE, cleanupFixtures, gitFixture, passDraft, report, setup, call } from './review-fixtures.mjs'
import { readApplyState } from '../lib/worktree/state.js'
import { manifestPath } from '../lib/worktree/land.js'

test.after(cleanupFixtures)

async function readyLand() {
  const { root, run } = gitFixture()
  run(['branch', '-M', 'main'])
  const fake = setup(root, undefined, { worktree: { enabled: true } })
  await passDraft(fake, root, run)
  const state = readApplyState(root, null, CHANGE)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, review: 'apply',
  })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, review: 'apply', report: report(),
  })
  return { root, run, fake, state }
}

test('land merges, archives, writes the manifest and marks archived', async () => {
  const { root, run, fake, state } = await readyLand()
  const landed = await call(fake, 'openspec_apply_worktree', {
    action: 'land', change: CHANGE, approvedBy: 'user',
  })
  assert.equal(landed.change, CHANGE)
  assert.equal(run(['log', '-1', '--format=%s']), `chore(openspec): archive ${CHANGE} via land ${landed.mergeCommit.slice(0, 8)}`)
  assert.equal(landed.archiveCommit, run(['rev-parse', 'HEAD']))
  assert.equal(existsSync(manifestPath(root, landed.mergeCommit)), true)
  assert.equal(readApplyState(root, null, CHANGE).status, 'archived')
  assert.equal(existsSync(state.worktree), true)
  assert.match(run(['branch', '--list', state.branch]), new RegExp(state.branch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
})

test('land refuses without user approval', async () => {
  const { fake } = await readyLand()
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE }),
    /approvedBy/,
  )
})

test('remove keeps the branch and deletes the state', async () => {
  const { root, fake, state } = await readyLand()
  await call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' })
  const removed = await call(fake, 'openspec_apply_worktree', { action: 'remove', change: CHANGE })
  assert.equal(removed.removed, true)
  assert.equal(removed.branch, state.branch)
  assert.equal(existsSync(state.worktree), false)
  assert.equal(readApplyState(root, null, CHANGE), undefined)
})

test('land works when apply review is disabled', async () => {
  const { root, run } = gitFixture()
  run(['branch', '-M', 'main'])
  const fake = setup(root, { draft: { enabled: true, reviewers: 0 }, apply: { enabled: false } }, { worktree: { enabled: true } })
  await passDraft(fake, root, run)
  const landed = await call(fake, 'openspec_apply_worktree', {
    action: 'land', change: CHANGE, approvedBy: 'user',
  })
  assert.equal(readApplyState(root, null, CHANGE).status, 'archived')
  assert.equal(landed.archiveCommit, run(['rev-parse', 'HEAD']))
})

test('remove guards active, dirty and foreign checkouts', async () => {
  const { root, fake, state } = await readyLand()
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'remove', change: CHANGE }),
    /archived state or abandon/,
  )
  await call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' })
  const fs = await import('node:fs')
  fs.writeFileSync(join(state.worktree, 'dirty.txt'), 'dirty\n')
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'remove', change: CHANGE }),
    /clean worktree/,
  )
})

test('land refuses no git, no state, a foreign state and non-main', async () => {
  const plainRoot = (await import('node:fs')).mkdtempSync(join((await import('node:os')).tmpdir(), 'land-plain-'))
  const plain = setup(plainRoot)
  await assert.rejects(
    call(plain, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }),
    /outside a git repository/,
  )
  const { root, run } = gitFixture()
  run(['branch', '-M', 'main'])
  const fake = setup(root, undefined, { worktree: { enabled: true } })
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }),
    /active or landing state/,
  )
  const { writeApplyState } = await import('../lib/worktree/state.js')
  writeApplyState(root, null, CHANGE, {
    schemaVersion: 1, change: CHANGE, store: null, mainRoot: root,
    worktree: join(root, 'foreign'), branch: 'foreign', baseCommit: 'a'.repeat(40),
    sealedCommit: null, status: 'active', createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(), lockToken: null, lockPid: null,
  })
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }),
    /plugin-created apply worktree/,
  )
})

test('land refuses a dirty main, dirty worktree, non-main and a worktree behind main', async () => {
  {
    const { root, run, fake } = await readyLand()
    run(['checkout', '-B', 'other'])
    await assert.rejects(call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }), /branch main/)
    writeFileSync(join(root, 'dirty.txt'), 'dirty\n')
    run(['checkout', '-B', 'main'])
    await assert.rejects(call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }), /clean main/)
  }
  {
    const { state, fake } = await readyLand()
    writeFileSync(join(state.worktree, 'dirty.txt'), 'dirty\n')
    await assert.rejects(call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }), /clean worktree/)
  }
  {
    const { root, run, fake } = await readyLand()
    writeFileSync(join(root, 'ahead.txt'), 'ahead\n')
    run(['add', 'ahead.txt'])
    run(['commit', '-m', 'main ahead'])
    await assert.rejects(call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }), /behind main/)
  }
})

test('land reuses an existing manifest for the current merge', async () => {
  const { root, run, fake } = await readyLand()
  const head = run(['rev-parse', 'HEAD'])
  const path = manifestPath(root, head)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify({ change: CHANGE, mergeCommit: head })}\n`)
  const result = await call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' })
  assert.equal(result.mergeCommit, head)
})

test('land refuses an unready apply review and a tree mismatch', async () => {
  {
    const { root, run } = gitFixture()
    run(['branch', '-M', 'main'])
    const fake = setup(root, undefined, { worktree: { enabled: true } })
    await passDraft(fake, root, run)
    await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
    await assert.rejects(
      call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }),
      /apply review is not ready/,
    )
  }
  {
    const { state, fake, run } = await readyLand()
    writeFileSync(join(state.worktree, 'late.txt'), 'late\n')
    run(['-C', state.worktree, 'add', 'late.txt'])
    run(['-C', state.worktree, 'commit', '-m', 'late worktree change'])
    await assert.rejects(
      call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }),
      /not ready|does not match/,
    )
  }
})

test('land keeps a resumable state when the archive commit fails', async () => {
  const { root, run, fake } = await readyLand()
  const hook = join(root, '.git', 'hooks', 'pre-commit')
  writeFileSync(hook, '#!/bin/sh\nexit 1\n', { mode: 0o755 })
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }),
    /commit/,
  )
  assert.equal(readApplyState(root, null, CHANGE).status, 'landing')
})

test('remove supports an approved abandon and refuses a missing state', async () => {
  const { root, fake, state } = await readyLand()
  const removed = await call(fake, 'openspec_apply_worktree', {
    action: 'remove', change: CHANGE, abandon: true, approvedBy: 'user', reason: 'stale trial',
  })
  assert.equal(removed.removed, true)
  assert.equal(existsSync(state.worktree), false)
  assert.equal(readApplyState(root, null, CHANGE), undefined)
  fake.ctx.workingDirectory.set({ id: 'review-test' }, root)
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'remove', change: CHANGE }),
    /no apply worktree state/,
  )
})

test('land refuses incomplete tasks and abandoned removal needs approval', async () => {
  const { root, run } = gitFixture()
  run(['branch', '-M', 'main'])
  writeFileSync(
    join(root, 'openspec', 'changes', CHANGE, 'tasks.md'),
    readFileSync(join(root, 'openspec', 'changes', CHANGE, 'tasks.md'), 'utf8').replace('- [x] 1.1', '- [ ] 1.1'),
  )
  run(['add', `openspec/changes/${CHANGE}`])
  run(['commit', '-m', 'incomplete tasks'])
  const fake = setup(root, undefined, { worktree: { enabled: true } })
  const { createOrReuseApplyWorktree } = await import('../lib/worktree/create.js')
  await createOrReuseApplyWorktree(fake.ctx, {
    mainRoot: root, store: null, change: CHANGE, sealCommit: run(['rev-parse', 'HEAD']),
    agent: { id: 'review-test' }, signal: new AbortController().signal,
  })
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }),
    /incomplete tasks/,
  )
  const state = readApplyState(root, null, CHANGE)
  fake.ctx.workingDirectory.set({ id: 'review-test' }, root)
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'remove', change: CHANGE, abandon: true }),
    /abandon requires/,
  )
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'remove', change: CHANGE }),
    /archived state or abandon/,
  )
  assert.equal(readApplyState(root, null, CHANGE).worktree, state.worktree)
})

test('land and remove require a change and remove refuses a foreign state', async () => {
  const { root, run } = gitFixture()
  run(['branch', '-M', 'main'])
  const fake = setup(root, undefined, { worktree: { enabled: true } })
  await assert.rejects(call(fake, 'openspec_apply_worktree', { action: 'land', approvedBy: 'user' }), /requires a non-empty change/)
  await assert.rejects(call(fake, 'openspec_apply_worktree', { action: 'remove' }), /requires a non-empty change/)
  const { writeApplyState } = await import('../lib/worktree/state.js')
  writeApplyState(root, null, CHANGE, {
    schemaVersion: 1, change: CHANGE, store: null, mainRoot: root,
    worktree: join(root, 'foreign'), branch: 'foreign', baseCommit: 'a'.repeat(40),
    sealedCommit: null, status: 'active', createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(), lockToken: null, lockPid: null,
  })
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'remove', change: CHANGE }),
    /plugin-created apply worktree/,
  )
})

test('land accepts a landing state and remove refuses a changed lock owner', async () => {
  const { root, fake, state } = await readyLand()
  const { writeApplyState } = await import('../lib/worktree/state.js')
  writeApplyState(root, null, CHANGE, { ...state, status: 'landing' })
  const landed = await call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' })
  assert.equal(landed.change, CHANGE)
  const second = await readyLand()
  writeApplyState(second.root, null, CHANGE, { ...second.state, lockToken: 'wrong-token' })
  await assert.rejects(
    call(second.fake, 'openspec_apply_worktree', {
      action: 'remove', change: CHANGE, abandon: true, approvedBy: 'user', reason: 'cleanup',
    }),
    /changed owner|recover it/,
  )
})

test('a missing branch keeps a resumable active state and remove refuses no git', async () => {
  const { root, state, fake, run } = await readyLand()
  run(['-C', state.worktree, 'checkout', '--detach'])
  run(['branch', '-D', state.branch])
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }),
    /merge|not something we can merge/i,
  )
  assert.equal(readApplyState(root, null, CHANGE).status, 'active')
})

test('remove refuses outside git', async () => {
  const plainRoot = (await import('node:fs')).mkdtempSync(join((await import('node:os')).tmpdir(), 'remove-plain-'))
  const plain = setup(plainRoot)
  await assert.rejects(
    call(plain, 'openspec_apply_worktree', { action: 'remove', change: CHANGE }),
    /outside a git repository/,
  )
})

test('a CLI archive without a result is refused', async () => {
  const { root, fake } = await readyLand()
  const original = fake.ctx.subprocess.spawn
  fake.ctx.subprocess.spawn = (spec) => {
    if (spec.argv.some((arg) => arg === 'archive')) {
      return {
        stdin: undefined,
        stdout: undefined,
        stderr: undefined,
        control: undefined,
        collected: {
          stdout: { readFrom: () => ({ text: '{"archive":null}' }) },
          stderr: { readFrom: () => ({ text: '' }) },
        },
        done: Promise.resolve({ exitCode: 0, signal: null }),
        terminate() {},
        waitForExit() {},
      }
    }
    return original(spec)
  }
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }),
    /no archive result/,
  )
  assert.equal(readApplyState(root, null, CHANGE).status, 'landing')
})

test('land refuses an archived state and abandon needs a reason', async () => {
  const { root, fake, state } = await readyLand()
  const { writeApplyState } = await import('../lib/worktree/state.js')
  writeApplyState(root, null, CHANGE, { ...state, status: 'archived', lockToken: null, lockPid: null })
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }),
    /active or landing state/,
  )
  fake.ctx.workingDirectory.set({ id: 'review-test' }, root)
  writeApplyState(root, null, CHANGE, { ...state, status: 'active' })
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', {
      action: 'remove', change: CHANGE, abandon: true, approvedBy: 'user',
    }),
    /abandon requires/,
  )
})

test('the worktree tool rejects an unknown action and recover outside git', async () => {
  const plainRoot = (await import('node:fs')).mkdtempSync(join((await import('node:os')).tmpdir(), 'worktree-tool-'))
  const fake = setup(plainRoot)
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'bogus' }),
    /use recover, land or remove/,
  )
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'recover', scope: 'change', change: CHANGE, expectedOwner: 'x' }),
    /outside a git repository/,
  )
})

test('land refuses when apply review never started', async () => {
  const { root, run } = gitFixture()
  run(['branch', '-M', 'main'])
  const fake = setup(root, undefined, { worktree: { enabled: true } })
  await passDraft(fake, root, run)
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'land', change: CHANGE, approvedBy: 'user' }),
    /apply review has not started/,
  )
})
