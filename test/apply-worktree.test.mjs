import assert from 'node:assert/strict'
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

import {
  CHANGE, cleanupFixtures, gitFixture, passDraft, setup, call, report,
} from './review-fixtures.mjs'
import { applyWorktreePath } from '../lib/worktree/create.js'
import { readApplyState } from '../lib/worktree/state.js'

test.after(cleanupFixtures)

test('apply creates a worktree, moves the session and routes task marking', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root, undefined, { worktree: { enabled: true } })
  await passDraft(fake, root, run)
  const state = readApplyState(root, null, CHANGE)
  assert.notEqual(state, undefined)
  assert.equal(state.worktree, applyWorktreePath(root, null, CHANGE))
  assert.equal(state.status, 'active')
  assert.equal(state.lockPid, process.pid)
  assert.equal(fake.ctx.workingDirectory.get({ id: 'review-test' }), state.worktree)
  const applied = await call(fake, 'openspec_apply_next', { change: CHANGE })
  assert.equal(applied.worktree.path, `.cache/openspec-flow/worktrees/local#${CHANGE}`)
  assert.equal(applied.root.path, root)

  const mainTasks = readFileSync(join(root, 'openspec', 'changes', CHANGE, 'tasks.md'), 'utf8')
  const worktreeTasksPath = join(state.worktree, 'openspec', 'changes', CHANGE, 'tasks.md')
  appendFileSync(worktreeTasksPath, '\n- [ ] 9.1 Worktree-only task\n')
  await call(fake, 'openspec_mark_task_done', { change: CHANGE, taskIds: ['9.1'] })
  assert.match(readFileSync(worktreeTasksPath, 'utf8'), /- \[x\] 9\.1 Worktree-only task/u)
  assert.equal(readFileSync(join(root, 'openspec', 'changes', CHANGE, 'tasks.md'), 'utf8'), mainTasks)

  const cwds = []
  const original = fake.ctx.subprocess.spawn
  fake.ctx.subprocess.spawn = (spec) => {
    cwds.push(spec.cwd)
    return original(spec)
  }
  await call(fake, 'openspec_inspect', { action: 'validate', change: CHANGE, strict: true })
  assert.ok(cwds.includes(state.worktree), 'validate runs in the worktree')
  cwds.length = 0
  await call(fake, 'openspec_inspect', { action: 'show', name: CHANGE })
  assert.ok(cwds.includes(root), 'other inspect reads stay on main')
})

test('archive refuses a plugin-created apply worktree', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root, undefined, { worktree: { enabled: true } })
  await passDraft(fake, root, run)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, review: 'apply',
  })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, review: 'apply', report: report(),
  })
  await assert.rejects(
    call(fake, 'openspec_archive', { change: CHANGE }),
    /openspec_apply_worktree action=land/,
  )
  fake.ctx.workingDirectory.set({ id: 'review-test' }, root)
  await assert.rejects(
    call(fake, 'openspec_archive', { change: CHANGE }),
    /openspec_apply_worktree action=land/,
  )
})


test('apply review accepts the explicit apply worktree', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root, undefined, { worktree: { enabled: true } })
  await passDraft(fake, root, run)
  const state = readApplyState(root, null, CHANGE)
  const started = await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, review: 'apply', worktree: state.worktree,
  })
  assert.equal(started.review, 'apply')
  assert.equal(started.state, 'in-review')
})

test('an explicit user-created worktree gets a review-only state', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root, undefined, { worktree: { enabled: true } })
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, report: report(),
  })
  run(['add', `openspec/changes/${CHANGE}`])
  run(['commit', '-m', 'seal for PR'])
  const pr = join(root, '..', `${root.split('/').pop()}-pr`)
  run(['worktree', 'add', pr, '-b', 'pr-branch'])
  const base = run(['rev-parse', 'HEAD~1'])
  try {
    await call(fake, 'openspec_review', {
      action: 'start', change: CHANGE, review: 'apply', worktree: pr,
      base,
    })
    const state = readApplyState(root, null, CHANGE)
    assert.equal(state.worktree, pr)
    assert.equal(state.baseCommit, base)
    assert.equal(state.branch, 'pr-branch')
    assert.equal(state.sealedCommit, null)
    assert.equal(state.lockToken, null)
    assert.equal(state.lockPid, null)
    const reported = await call(fake, 'openspec_review', {
      action: 'self-report', change: CHANGE, review: 'apply', report: report(),
    })
    assert.equal(reported.ready, true)
  } finally {
    run(['worktree', 'remove', '--force', pr])
  }
})

test('a creation failure is reported after the draft gate', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root, undefined, { worktree: { enabled: true } })
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, report: report(),
  })
  run(['add', `openspec/changes/${CHANGE}`])
  run(['commit', '-m', 'seal for failure'])
  const exclude = join(root, '.git', 'info', 'exclude')
  appendFileSync(exclude, '\n.cache\n')
  writeFileSync(join(root, '.cache'), 'blocked')
  await assert.rejects(
    call(fake, 'openspec_apply_next', { change: CHANGE }),
    /git worktree add/,
  )
  assert.equal(readApplyState(root, null, CHANGE), undefined)
  rmSync(join(root, '.cache'), { force: true })
})

test('a dirty or main-subdirectory worktree is refused', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root, undefined, { worktree: { enabled: true } })
  await passDraft(fake, root, run)
  const state = readApplyState(root, null, CHANGE)
  writeFileSync(join(state.worktree, 'dirty.txt'), 'dirty\n')
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'start', change: CHANGE, review: 'apply', worktree: state.worktree,
    }),
    /must be clean/,
  )
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'start', change: CHANGE, review: 'apply', worktree: join(root, 'openspec'),
    }),
    /root of a linked checkout/,
  )
})

test('an unready draft refuses apply before creating a worktree', async () => {
  const { root } = gitFixture()
  const fake = setup(root, undefined, { worktree: { enabled: true } })
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await assert.rejects(
    call(fake, 'openspec_apply_next', { change: CHANGE }),
    /draft review is not ready/,
  )
  assert.equal(existsSync(join(root, '.cache', 'openspec-flow', 'worktrees')), false)
})

test('a legacy apply lock holder blocks worktree apply', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root, undefined, { worktree: { enabled: true } })
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, report: report(),
  })
  run(['add', `openspec/changes/${CHANGE}`])
  run(['commit', '-m', 'seal for legacy lock'])
  const directory = join(root, '.git', 'openspec-flow')
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, 'apply.lock.json'), `${JSON.stringify({
    schemaVersion: 1, change: 'other-change', store: null,
    changeRoot: root,
    implementationRoot: root, startedAt: new Date().toISOString(),
  })}\n`)
  await assert.rejects(
    call(fake, 'openspec_apply_next', { change: CHANGE }),
    /other-change/,
  )
})
