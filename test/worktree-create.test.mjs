import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { createFakeContext } from './fake-context.mjs'
import {
  applyWorktreeBranch,
  applyWorktreePath,
  createOrReuseApplyWorktree,
} from '../lib/worktree/create.js'
import { applyStatePath, readApplyState, writeApplyState } from '../lib/worktree/state.js'
import { gitCommonDir } from '../lib/review/store.js'
import { lockPath } from '../lib/worktree/lock.js'
import { PNPM_VERSION, buildRecord, pnpmBucket, writeRecord } from '../scripts/toolchain.mjs'

const roots = []

function git(cwd, args) {
  return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim()
}

function repository(change = 'demo') {
  const root = mkdtempSync(join(tmpdir(), 'openspec-flow-worktree-create-'))
  roots.push(root)
  git(root, ['init', '-q'])
  git(root, ['config', 'user.email', 'test@example.com'])
  git(root, ['config', 'user.name', 'Test'])
  mkdirSync(join(root, 'openspec', 'changes', change), { recursive: true })
  writeFileSync(join(root, 'openspec', 'changes', change, 'tasks.md'), '# Tasks\n\n- [ ] 1.1 Do it\n')
  writeFileSync(join(root, 'package.json'), '{"engines":{"node":">=24.9.0"}}\n')
  writeFileSync(join(root, 'package-lock.json'), '{"lockfileVersion":3,"packages":{}}\n')
  writeFileSync(join(root, 'coverage.baseline.json'), '{"node":{"version":"v24.22.2"}}\n')
  writeFileSync(join(root, 'coverage.config.json'), '{"primaryNodeMajor":24}\n')
  git(root, ['add', '.'])
  git(root, ['commit', '-qm', 'seal'])
  return root
}

function context(cwd) {
  return createFakeContext({ cwd }).ctx
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

test('a detached worktree is refused instead of reused', async () => {
  const root = repository()
  const head = git(root, ['rev-parse', 'HEAD'])
  const fake = context(root)
  const agent = { id: 'detached-test' }
  const first = await createOrReuseApplyWorktree(fake, {
    mainRoot: root, store: null, change: 'demo', sealCommit: head, agent,
    signal: new AbortController().signal,
  })
  git(first.worktree, ['checkout', '--detach'])
  await fake.workingDirectory.set({ id: agent.id }, root)
  await assert.rejects(
    createOrReuseApplyWorktree(fake, {
      mainRoot: root, store: null, change: 'demo', sealCommit: head, agent,
      signal: new AbortController().signal,
    }),
    /not on branch/,
  )
  assert.equal(fake.workingDirectory.get({ id: agent.id }), root)
  assert.deepEqual(readApplyState(root, null, 'demo'), first)
})

test('a worktree on another branch is refused instead of reused', async () => {
  const root = repository()
  const head = git(root, ['rev-parse', 'HEAD'])
  const fake = context(root)
  const agent = { id: 'branch-switch-test' }
  const first = await createOrReuseApplyWorktree(fake, {
    mainRoot: root, store: null, change: 'demo', sealCommit: head, agent,
    signal: new AbortController().signal,
  })
  git(first.worktree, ['checkout', '-q', '-b', 'scratch-branch'])
  await fake.workingDirectory.set({ id: agent.id }, root)
  await assert.rejects(
    createOrReuseApplyWorktree(fake, {
      mainRoot: root, store: null, change: 'demo', sealCommit: head, agent,
      signal: new AbortController().signal,
    }),
    /not on branch/,
  )
  assert.equal(fake.workingDirectory.get({ id: agent.id }), root)
  assert.deepEqual(readApplyState(root, null, 'demo'), first)
})

test('a dirty worktree is refused instead of reused', async () => {
  const root = repository()
  const head = git(root, ['rev-parse', 'HEAD'])
  const fake = context(root)
  const agent = { id: 'dirty-test' }
  const first = await createOrReuseApplyWorktree(fake, {
    mainRoot: root, store: null, change: 'demo', sealCommit: head, agent,
    signal: new AbortController().signal,
  })
  writeFileSync(join(first.worktree, 'scratch.txt'), 'work in progress\n')
  await fake.workingDirectory.set({ id: agent.id }, root)
  await assert.rejects(
    createOrReuseApplyWorktree(fake, {
      mainRoot: root, store: null, change: 'demo', sealCommit: head, agent,
      signal: new AbortController().signal,
    }),
    /uncommitted changes[\s\S]*scratch\.txt/u,
  )
  assert.equal(readFileSync(join(first.worktree, 'scratch.txt'), 'utf8'), 'work in progress\n')
  assert.equal(fake.workingDirectory.get({ id: agent.id }), root)
  assert.deepEqual(readApplyState(root, null, 'demo'), first)
})

test('a clean worktree with commits on its branch is still reused', async () => {
  const root = repository()
  const head = git(root, ['rev-parse', 'HEAD'])
  const fake = context(root)
  const agent = { id: 'committed-reuse-test' }
  const first = await createOrReuseApplyWorktree(fake, {
    mainRoot: root, store: null, change: 'demo', sealCommit: head, agent,
    signal: new AbortController().signal,
  })
  writeFileSync(join(first.worktree, 'openspec', 'changes', 'demo', 'notes.md'), 'implementation\n')
  git(first.worktree, ['add', 'openspec'])
  git(first.worktree, ['commit', '-qm', 'implement'])
  const committed = git(first.worktree, ['rev-parse', 'HEAD'])
  assert.notEqual(committed, head)
  const second = await createOrReuseApplyWorktree(fake, {
    mainRoot: root, store: null, change: 'demo', sealCommit: head, agent,
    signal: new AbortController().signal,
  })
  assert.deepEqual(second, first)
  assert.equal(git(second.worktree, ['rev-parse', 'HEAD']), committed)
  assert.equal(fake.workingDirectory.get({ id: agent.id }), second.worktree)
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
  const fake = context(root)
  await assert.rejects(
    createOrReuseApplyWorktree(fake, {
      mainRoot: root, store: null, change: 'demo', sealCommit: head,
      agent: undefined, signal: new AbortController().signal,
    }),
    /agent session/,
  )
  assert.equal(git(root, ['rev-parse', `refs/heads/${branch}`]), head)
  assert.equal(git(root, ['rev-parse', 'refs/openspec-flow/seal/demo']), head)
  assert.equal(existsSync(applyWorktreePath(root, null, 'demo')), false)
})

test('a failed session move deletes a branch the call created itself', async () => {
  const root = repository()
  const head = git(root, ['rev-parse', 'HEAD'])
  const branch = applyWorktreeBranch(null, 'demo')
  const fake = context(root)
  await assert.rejects(
    createOrReuseApplyWorktree(fake, {
      mainRoot: root, store: null, change: 'demo', sealCommit: head,
      agent: undefined, signal: new AbortController().signal,
    }),
    /agent session/,
  )
  assert.equal(git(root, ['branch', '--list', branch]), '')
  assert.equal(existsSync(applyWorktreePath(root, null, 'demo')), false)
  assert.equal(readApplyState(root, null, 'demo'), undefined)
})

test('a retry after a failed creation reuses the same branch commit', async () => {
  const root = repository()
  const head = git(root, ['rev-parse', 'HEAD'])
  const branch = applyWorktreeBranch(null, 'demo')
  const fake = context(root)
  await assert.rejects(
    createOrReuseApplyWorktree(fake, {
      mainRoot: root, store: null, change: 'demo', sealCommit: head,
      agent: undefined, signal: new AbortController().signal,
    }),
    /agent session/,
  )
  const state = await createOrReuseApplyWorktree(fake, {
    mainRoot: root, store: null, change: 'demo', sealCommit: head,
    agent: { id: 'retry' }, signal: new AbortController().signal,
  })
  assert.equal(state.baseCommit, head)
  assert.equal(git(root, ['rev-parse', `refs/heads/${branch}`]), head)
})


test('creation runs the injected preparation before publishing the state', async () => {
  const root = repository()
  const head = git(root, ['rev-parse', 'HEAD'])
  const fake = context(root)
  const calls = []
  const state = await createOrReuseApplyWorktree(fake, {
    mainRoot: root, store: null, change: 'demo', sealCommit: head, agent: { id: 'prepare-test' },
    signal: new AbortController().signal,
    prepareEnvironment: async ({ worktree }) => { calls.push(worktree) },
  })
  assert.deepEqual(calls, [state.worktree])
  assert.equal(readApplyState(root, null, 'demo').status, 'active')
})

test('a failed preparation rolls the worktree and state back', async () => {
  const root = repository()
  const head = git(root, ['rev-parse', 'HEAD'])
  const fake = context(root)
  await assert.rejects(
    createOrReuseApplyWorktree(fake, {
      mainRoot: root, store: null, change: 'demo', sealCommit: head, agent: { id: 'prepare-fail' },
      signal: new AbortController().signal,
      prepareEnvironment: async () => { throw new Error('preparation failed') },
    }),
    /preparation failed/,
  )
  assert.equal(existsSync(applyWorktreePath(root, null, 'demo')), false)
  assert.equal(readApplyState(root, null, 'demo'), undefined)
})

test('reuse skips a current record and prepares a stale one', async () => {
  const root = repository()
  const head = git(root, ['rev-parse', 'HEAD'])
  const fake = context(root)
  const agent = { id: 'reuse-record' }
  const calls = []
  const first = await createOrReuseApplyWorktree(fake, {
    mainRoot: root, store: null, change: 'demo', sealCommit: head, agent,
    signal: new AbortController().signal,
    prepareEnvironment: async () => { calls.push('first') },
  })
  const node = join(first.worktree, 'node')
  const pnpmJs = join(first.worktree, 'pnpm.mjs')
  const binDir = join(first.worktree, 'bin')
  writeFileSync(node, '')
  writeFileSync(pnpmJs, '')
  mkdirSync(binDir, { recursive: true })
  writeRecord(first.worktree, buildRecord({
    root: first.worktree,
    requirements: { nodeRange: '>=24.9.0', primaryNodeMajor: 24, pnpm: PNPM_VERSION },
    node: { path: node, version: 'v24.22.2', source: 'host' },
    npm: { path: node, version: '11.0.0' },
    pnpm: { bucket: pnpmBucket('/shared'), version: PNPM_VERSION, js: pnpmJs, binDir, node },
    chromium: null,
  }))
  const second = await createOrReuseApplyWorktree(fake, {
    mainRoot: root, store: null, change: 'demo', sealCommit: head, agent,
    signal: new AbortController().signal,
    prepareEnvironment: async () => { calls.push('second') },
  })
  assert.deepEqual(calls, ['first'])
  writeFileSync(join(second.worktree, 'package-lock.json'), '{"lockfileVersion":3,"packages":{"x":{}}}\n')
  await createOrReuseApplyWorktree(fake, {
    mainRoot: root, store: null, change: 'demo', sealCommit: head, agent,
    signal: new AbortController().signal,
    prepareEnvironment: async () => { calls.push('stale') },
  })
  assert.deepEqual(calls, ['first', 'stale'])
})
