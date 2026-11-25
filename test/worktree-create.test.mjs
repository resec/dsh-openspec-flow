import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { createFakeContext } from './fake-context.mjs'
import { startLockChild } from './fixtures/lock-child-runner.mjs'
import {
  applyWorktreeBranch,
  applyWorktreePath,
  createOrReuseApplyWorktree,
} from '../lib/worktree/create.js'
import { applyStatePath, readApplyState, writeApplyState } from '../lib/worktree/state.js'
import { gitCommonDir } from '../lib/review/store.js'
import { inspectLock, lockPath } from '../lib/worktree/lock.js'

const roots = []

function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim()
}

function scratch() {
  const root = mkdtempSync(join(tmpdir(), 'openspec-flow-worktree-create-'))
  roots.push(root)
  return root
}

function repository(change = 'demo') {
  const root = scratch()
  git(root, ['init', '-q'])
  git(root, ['config', 'user.email', 'test@example.com'])
  git(root, ['config', 'user.name', 'Test'])
  mkdirSync(join(root, 'openspec', 'changes', change), { recursive: true })
  writeFileSync(join(root, 'openspec', 'changes', change, 'tasks.md'), '# Tasks\n\n- [ ] 1.1 Do it\n')
  git(root, ['add', '.'])
  git(root, ['commit', '-qm', 'seal'])
  return root
}

function context(cwd) {
  return createFakeContext({ cwd }).ctx
}

/**
 * A Host whose move really writes into the target, so a read-only worktree
 * fails the move with a filesystem error instead of a missing agent.
 */
function readOnlyTargetContext(cwd) {
  const fake = createFakeContext({ cwd }).ctx
  fake.workingDirectory.set = async (_agent, path) => {
    chmodSync(path, 0o555)
    try {
      writeFileSync(join(path, '.host-session'), 'session\n')
    } finally {
      chmodSync(path, 0o755)
    }
  }
  return fake
}

/** Wait for a file the child process creates, so the overlap is deterministic. */
async function waitForFile(path, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs
  while (!existsSync(path)) {
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${path}`)
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

test('creates a worktree from the seal commit, moves the session and writes the state', async () => {
  const root = repository()
  const head = git(root, ['rev-parse', 'HEAD'])
  const fake = context(root)
  const agent = { id: 'create-test' }
  const state = await createOrReuseApplyWorktree(fake, {
    mainRoot: root, store: null, change: 'demo', sealCommit: head, agent,
    signal: new AbortController().signal,
  })
  assert.equal(state.worktree, applyWorktreePath(root, null, 'demo'))
  assert.equal(state.branch, applyWorktreeBranch(null, 'demo'))
  assert.equal(state.baseCommit, head)
  assert.equal(state.sealedCommit, head)
  assert.equal(state.lockPid, process.pid)
  assert.equal(existsSync(join(state.worktree, 'openspec', 'changes', 'demo', 'tasks.md')), true)
  assert.equal(fake.workingDirectory.get({ id: agent.id }), state.worktree)
  assert.deepEqual(readApplyState(root, null, 'demo'), state)
  assert.equal(git(root, ['status', '--porcelain']), '')
})

test('reuses an active worktree without creating a second checkout', async () => {
  const root = repository()
  const head = git(root, ['rev-parse', 'HEAD'])
  const fake = context(root)
  const agent = { id: 'reuse-test' }
  const first = await createOrReuseApplyWorktree(fake, {
    mainRoot: root, store: null, change: 'demo', sealCommit: head, agent,
    signal: new AbortController().signal,
  })
  const second = await createOrReuseApplyWorktree(fake, {
    mainRoot: root, store: null, change: 'demo', sealCommit: head, agent,
    signal: new AbortController().signal,
  })
  assert.deepEqual(second, first)
  assert.equal(git(root, ['worktree', 'list', '--porcelain']).split('\n').filter((line) => line.startsWith('worktree ')).length, 2)
})

test('uses a branch-safe name for a double-dot change and a leading-dot store', () => {
  const branch = applyWorktreeBranch('.store', 'release..1')
  assert.match(branch, /^openspec\/apply\/-store-release--1-[0-9a-f]{8}$/)
  assert.doesNotMatch(branch, /\.\./)
})

test('a non-git project refuses creation', async () => {
  const root = mkdtempSync(join(tmpdir(), 'openspec-flow-worktree-create-'))
  roots.push(root)
  const fake = context(root)
  await assert.rejects(
    createOrReuseApplyWorktree(fake, {
      mainRoot: root, store: null, change: 'demo', sealCommit: 'a'.repeat(40),
      agent: { id: 'plain' }, signal: new AbortController().signal,
    }),
    /outside a git repository/,
  )
})

test('a failed creation removes the worktree, branch and state', async () => {
  const root = repository()
  const fake = context(root)
  const branch = applyWorktreeBranch(null, 'demo')
  await assert.rejects(
    createOrReuseApplyWorktree(fake, {
      mainRoot: root, store: null, change: 'demo', sealCommit: 'b'.repeat(40),
      agent: { id: 'failed' }, signal: new AbortController().signal,
    }),
    /git worktree add/,
  )
  assert.equal(existsSync(applyWorktreePath(root, null, 'demo')), false)
  assert.equal(readApplyState(root, null, 'demo'), undefined)
  assert.equal(existsSync(applyStatePath(root, null, 'demo')), false)
  assert.equal(git(root, ['branch', '--list', branch]), '')
})

test('an existing generated branch is replaced and an existing ignore line is reused', async () => {
  const root = repository()
  const head = git(root, ['rev-parse', 'HEAD'])
  const branch = applyWorktreeBranch(null, 'demo')
  git(root, ['branch', branch])
  const exclude = join(root, '.git', 'info', 'exclude')
  writeFileSync(exclude, '.cache/openspec-flow/worktrees/\n')
  const fake = context(root)
  const state = await createOrReuseApplyWorktree(fake, {
    mainRoot: root, store: null, change: 'demo', sealCommit: head,
    agent: { id: 'branch-test' }, signal: new AbortController().signal,
  })
  assert.equal(state.branch, branch)
  assert.equal(git(root, ['status', '--porcelain']), '')
})

test('a missing exclude file is created', async () => {
  const root = repository()
  const head = git(root, ['rev-parse', 'HEAD'])
  rmSync(join(root, '.git', 'info', 'exclude'), { force: true })
  const fake = context(root)
  await createOrReuseApplyWorktree(fake, {
    mainRoot: root, store: null, change: 'demo', sealCommit: head,
    agent: { id: 'exclude-test' }, signal: new AbortController().signal,
  })
  assert.match(readFileSync(join(root, '.git', 'info', 'exclude'), 'utf8'), /worktrees/)
})

test('a Host without a directory setter refuses before publishing state', async () => {
  const root = repository()
  const head = git(root, ['rev-parse', 'HEAD'])
  await assert.rejects(
    createOrReuseApplyWorktree({ workingDirectory: {} }, {
      mainRoot: root, store: null, change: 'demo', sealCommit: head,
      agent: { id: 'no-set' }, signal: new AbortController().signal,
    }),
    /cannot move the session/,
  )
  assert.equal(readApplyState(root, null, 'demo'), undefined)
})

test('a missing agent is refused', async () => {
  const root = repository()
  const head = git(root, ['rev-parse', 'HEAD'])
  const fake = context(root)
  await assert.rejects(
    createOrReuseApplyWorktree(fake, {
      mainRoot: root, store: null, change: 'demo', sealCommit: head,
      signal: new AbortController().signal,
    }),
    /requires an agent/,
  )
})


test('a landing state is refused by apply', async () => {
  const root = repository()
  const head = git(root, ['rev-parse', 'HEAD'])
  const fake = context(root)
  const agent = { id: 'landing-test' }
  const state = await createOrReuseApplyWorktree(fake, {
    mainRoot: root, store: null, change: 'demo', sealCommit: head, agent,
    signal: new AbortController().signal,
  })
  writeApplyState(root, null, 'demo', { ...state, status: 'landing' })
  await assert.rejects(
    createOrReuseApplyWorktree(fake, {
      mainRoot: root, store: null, change: 'demo', sealCommit: head, agent,
      signal: new AbortController().signal,
    }),
    /landing/,
  )
})

test('a failed session move removes the new checkout', async () => {
  const root = repository()
  const head = git(root, ['rev-parse', 'HEAD'])
  const fake = context(root)
  fake.workingDirectory.set = async () => {
    throw new Error('set failed')
  }
  await assert.rejects(
    createOrReuseApplyWorktree(fake, {
      mainRoot: root, store: null, change: 'demo', sealCommit: head,
      agent: { id: 'move-failed' }, signal: new AbortController().signal,
    }),
    /set failed/,
  )
  assert.equal(readApplyState(root, null, 'demo'), undefined)
  assert.equal(existsSync(applyWorktreePath(root, null, 'demo')), false)
  assert.equal(existsSync(lockPath(gitCommonDir(root), 'change', { change: 'demo' })), false)
})

test('a failed session move keeps a seal-created branch and its ref', async () => {
  const root = repository()
  const head = git(root, ['rev-parse', 'HEAD'])
  const branch = applyWorktreeBranch(null, 'demo')
  git(root, ['branch', branch, head])
  git(root, ['update-ref', 'refs/openspec-flow/seal/demo', head])
  const agent = { id: 'seal-branch-move' }
  const fake = readOnlyTargetContext(root)
  await assert.rejects(
    createOrReuseApplyWorktree(fake, {
      mainRoot: root, store: null, change: 'demo', sealCommit: head,
      agent, signal: new AbortController().signal,
    }),
    /EACCES|EPERM/,
  )
  assert.equal(git(root, ['rev-parse', `refs/heads/${branch}`]), head)
  assert.equal(git(root, ['rev-parse', 'refs/openspec-flow/seal/demo']), head)
  assert.equal(existsSync(applyWorktreePath(root, null, 'demo')), false)
  assert.equal(fake.workingDirectory.get({ id: agent.id }), root)
})

test('a failed session move deletes a branch the call created itself', async () => {
  const root = repository()
  const head = git(root, ['rev-parse', 'HEAD'])
  const branch = applyWorktreeBranch(null, 'demo')
  const agent = { id: 'own-branch-move' }
  const fake = readOnlyTargetContext(root)
  await assert.rejects(
    createOrReuseApplyWorktree(fake, {
      mainRoot: root, store: null, change: 'demo', sealCommit: head,
      agent, signal: new AbortController().signal,
    }),
    /EACCES|EPERM/,
  )
  assert.equal(git(root, ['branch', '--list', branch]), '')
  assert.equal(existsSync(applyWorktreePath(root, null, 'demo')), false)
  assert.equal(readApplyState(root, null, 'demo'), undefined)
  assert.equal(fake.workingDirectory.get({ id: agent.id }), root)
})

test('a retry after a failed creation reuses the same branch commit', async () => {
  const root = repository()
  const head = git(root, ['rev-parse', 'HEAD'])
  const branch = applyWorktreeBranch(null, 'demo')
  await assert.rejects(
    createOrReuseApplyWorktree(readOnlyTargetContext(root), {
      mainRoot: root, store: null, change: 'demo', sealCommit: head,
      agent: { id: 'retry-failed' }, signal: new AbortController().signal,
    }),
    /EACCES|EPERM/,
  )
  const state = await createOrReuseApplyWorktree(context(root), {
    mainRoot: root, store: null, change: 'demo', sealCommit: head,
    agent: { id: 'retry' }, signal: new AbortController().signal,
  })
  assert.equal(state.baseCommit, head)
  assert.equal(git(root, ['rev-parse', `refs/heads/${branch}`]), head)
})

test('a child process reacquires a dead owner lock and replaces the state token and pid', async (t) => {
  const root = repository()
  const head = git(root, ['rev-parse', 'HEAD'])
  const first = await createOrReuseApplyWorktree(context(root), {
    mainRoot: root, store: null, change: 'demo', sealCommit: head,
    agent: { id: 'dead-owner' }, signal: new AbortController().signal,
  })
  const common = gitCommonDir(root)
  writeApplyState(root, null, 'demo', { ...first, lockToken: 'dead-token', lockPid: 2147483647 })
  rmSync(lockPath(common, 'change', { change: 'demo' }), { recursive: true, force: true })
  const child = startLockChild('create-worktree', { mainRoot: root, change: 'demo', sealCommit: head })
  t.after(() => child.child.kill('SIGKILL'))
  const ready = await child.ready
  assert.notEqual(ready.pid, process.pid)
  await child.done
  const state = readApplyState(root, null, 'demo')
  assert.equal(state.lockPid, ready.pid)
  assert.notEqual(state.lockToken, 'dead-token')
  assert.equal(state.worktree, first.worktree)
})

test('creating one worktree does not block another change', async (t) => {
  const root = repository()
  const head = git(root, ['rev-parse', 'HEAD'])
  const signal = new AbortController().signal
  const fake = context(root)
  const existing = await createOrReuseApplyWorktree(fake, {
    mainRoot: root, store: null, change: 'demo', sealCommit: head,
    agent: { id: 'parent' }, signal,
  })
  const holdFile = join(scratch(), 'holding')
  const releaseFile = join(scratch(), 'release')
  const child = startLockChild('create-worktree', {
    mainRoot: root, change: 'one', sealCommit: head, holdFile, releaseFile,
  })
  t.after(() => child.child.kill('SIGKILL'))
  const ready = await child.ready
  await waitForFile(holdFile)
  const common = gitCommonDir(root)
  assert.equal(existsSync(lockPath(common, 'change', { change: 'one' })), true, 'the child holds the change lock')
  assert.equal(existsSync(lockPath(common, 'lifecycle')), false, 'creating a worktree takes no lifecycle lock')

  const again = await createOrReuseApplyWorktree(fake, {
    mainRoot: root, store: null, change: 'demo', sealCommit: head,
    agent: { id: 'parent' }, signal,
  })
  assert.equal(again.worktree, existing.worktree)
  const parallel = await createOrReuseApplyWorktree(fake, {
    mainRoot: root, store: null, change: 'two', sealCommit: head,
    agent: { id: 'parent-two' }, signal,
  })
  assert.equal(existsSync(parallel.worktree), true)
  assert.equal(inspectLock(lockPath(common, 'change', { change: 'demo' })).state, 'alive')

  writeFileSync(releaseFile, 'release\n')
  await child.done
  const childState = readApplyState(root, null, 'one')
  assert.equal(childState.worktree, applyWorktreePath(root, null, 'one'))
  assert.equal(childState.lockPid, ready.pid)
  assert.equal(existsSync(childState.worktree), true)
})
