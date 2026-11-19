import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { apply } from '../index.js'
import { gitCommonDir } from '../lib/review/store.js'
import { applyStatePath, writeApplyState } from '../lib/worktree/state.js'
import { lockPath } from '../lib/worktree/lock.js'
import { createFakeContext } from './fake-context.mjs'

const roots = []

function temporary() {
  const root = mkdtempSync(join(tmpdir(), 'openspec-flow-worktree-inspect-'))
  roots.push(root)
  return root
}

function repository() {
  const root = temporary()
  execFileSync('git', ['-C', root, 'init', '-q'])
  execFileSync('git', ['-C', root, 'config', 'user.email', 'test@example.com'])
  execFileSync('git', ['-C', root, 'config', 'user.name', 'Test'])
  writeFileSync(join(root, 'README.md'), 'root\n')
  execFileSync('git', ['-C', root, 'add', 'README.md'])
  execFileSync('git', ['-C', root, 'commit', '-qm', 'root'])
  return root
}

function setup(root) {
  const fake = createFakeContext({ cwd: root })
  apply(fake.ctx, { timeoutMs: 30_000, reviews: { draft: { enabled: false }, apply: { enabled: false } } })
  return fake
}

async function call(fake, name, args) {
  const tool = fake.tools.get(name)
  assert.ok(tool, `tool ${name} is registered`)
  return tool.execute(args, { agent: { id: 'worktree-test' }, signal: new AbortController().signal })
}

function state(root, extra = {}) {
  return {
    schemaVersion: 1,
    change: 'demo',
    store: null,
    mainRoot: root,
    worktree: join(root, 'worktree'),
    branch: 'openspec/apply/demo',
    baseCommit: 'a'.repeat(40),
    sealedCommit: null,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastUsedAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  }
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

test('worktree inspection is read-only and reports ready state', async () => {
  const root = repository()
  mkdirSync(join(root, 'worktree'))
  writeApplyState(root, null, 'demo', state(root))
  const before = readFileSync(applyStatePath(root, null, 'demo'), 'utf8')
  const fake = setup(root)
  const result = await call(fake, 'openspec_inspect', { action: 'worktree', change: 'demo' })
  assert.equal(result.status, 'ready')
  assert.equal(result.state.valid, true)
  assert.equal(result.worktree.exists, true)
  assert.deepEqual(result.locks.map((entry) => entry.held), [false, false])
  const branch = fake.tools.get('openspec_inspect').output.schema.oneOf.find((entry) => entry.properties?.repair !== undefined)
  assert.ok(branch, 'the worktree output branch exists')
  for (const lock of result.locks) {
    for (const key of Object.keys(lock)) assert.ok(key in branch.properties.locks.items.properties, `lock field ${key} is declared`)
  }
  assert.equal(result.repair.action, 'none')
  assert.equal('cache' in result, false)
  assert.equal('profile' in result, false)
  assert.equal('port' in result, false)
  assert.equal(readFileSync(applyStatePath(root, null, 'demo'), 'utf8'), before)
})

test('a missing worktree is a manual repair and writes nothing', async () => {
  const root = repository()
  writeApplyState(root, null, 'demo', state(root))
  const fake = setup(root)
  const result = await call(fake, 'openspec_inspect', { action: 'worktree', change: 'demo' })
  assert.equal(result.status, 'repair-required')
  assert.equal(result.repair.action, 'manual')
  assert.match(result.repair.message, /does not exist/)
  assert.equal(existsSync(join(root, 'worktree')), false)
})

test('a corrupt state is reported and not rewritten', async () => {
  const root = repository()
  const path = applyStatePath(root, null, 'demo')
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, '{not json')
  const fake = setup(root)
  const result = await call(fake, 'openspec_inspect', { action: 'worktree', change: 'demo' })
  assert.equal(result.status, 'repair-required')
  assert.equal(result.state.valid, false)
  assert.equal(result.repair.action, 'manual')
  assert.equal(readFileSync(path, 'utf8'), '{not json')
})

test('a dead lock is reported as a recover repair', async () => {
  const root = repository()
  const common = gitCommonDir(root)
  mkdirSync(lockPath(common, 'change', { change: 'demo' }), { recursive: true })
  writeFileSync(join(lockPath(common, 'change', { change: 'demo' }), 'owner'), `${JSON.stringify({
    schema: 1, token: 'dead-token', pid: 2147483647, at: new Date().toISOString(), what: 'test',
  })}\n`)
  const fake = setup(root)
  const result = await call(fake, 'openspec_inspect', { action: 'worktree', change: 'demo' })
  assert.equal(result.status, 'repair-required')
  assert.deepEqual(result.repair, { action: 'recover', scope: 'change', expectedOwner: 'dead-token' })
})

test('recover removes the dead lock after the token matches', async () => {
  const root = repository()
  const common = gitCommonDir(root)
  const path = lockPath(common, 'change', { change: 'demo' })
  mkdirSync(path, { recursive: true })
  writeFileSync(join(path, 'owner'), `${JSON.stringify({
    schema: 1, token: 'dead-token', pid: 2147483647, at: new Date().toISOString(), what: 'test',
  })}\n`)
  const fake = setup(root)
  const result = await call(fake, 'openspec_apply_worktree', {
    action: 'recover', change: 'demo', scope: 'change', expectedOwner: 'dead-token',
  })
  assert.deepEqual(result, { recovered: true, scope: 'change' })
  assert.equal(existsSync(path), false)
})

test('recover rejects missing owner and scope arguments before touching a lock', async () => {
  const root = repository()
  const fake = setup(root)
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'recover', change: 'demo', scope: 'change' }),
    /requires the expectedOwner token/,
  )
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'recover', expectedOwner: 'x', scope: 'bogus' }),
    /unknown lock scope/,
  )
})

test('a non-git project reports worktree state unavailable', async () => {
  const root = temporary()
  const fake = setup(root)
  const result = await call(fake, 'openspec_inspect', { action: 'worktree', change: 'demo' })
  assert.equal(result.status, 'unavailable')
  assert.equal(result.state.path, null)
  assert.deepEqual(result.locks, [])
  assert.equal(result.repair.action, 'manual')
})

test('recover rejects an unknown action and a non-git project', async () => {
  const root = temporary()
  const fake = setup(root)
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', { action: 'bogus' }),
    /Unsupported action 'bogus'/,
  )
  await assert.rejects(
    call(fake, 'openspec_apply_worktree', {
      action: 'recover', scope: 'lifecycle', expectedOwner: 'x',
    }),
    /unavailable outside a git repository/,
  )
})


test('an absent state is unavailable and writes nothing', async () => {
  const root = repository()
  const fake = setup(root)
  const result = await call(fake, 'openspec_inspect', { action: 'worktree', change: 'demo' })
  assert.equal(result.status, 'unavailable')
  assert.equal(result.state.exists, false)
  assert.equal(result.repair.action, 'none')
  assert.equal(existsSync(applyStatePath(root, null, 'demo')), false)
})

test('a lock directory without an owner is a manual repair', async () => {
  const root = repository()
  const common = gitCommonDir(root)
  mkdirSync(lockPath(common, 'change', { change: 'demo' }), { recursive: true })
  const fake = setup(root)
  const result = await call(fake, 'openspec_inspect', { action: 'worktree', change: 'demo' })
  assert.equal(result.status, 'repair-required')
  assert.equal(result.repair.action, 'manual')
  assert.match(result.repair.message, /no usable owner/)
  assert.equal(result.locks[1].held, true)
  assert.equal(result.locks[1].state, 'corrupt')
})
