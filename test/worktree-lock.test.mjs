import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'

import { gitCommonDir } from '../lib/review/store.js'
import {
  acquireLock, acquireOrdered, inspectLock, isDeadLock, lockPath, recoverLock, releaseLock,
} from '../lib/worktree/lock.js'
import { initFixtureRepo } from './git-fixture.mjs'

const roots = []

function temporary() {
  const root = mkdtempSync(join(tmpdir(), 'openspec-flow-worktree-lock-'))
  roots.push(root)
  return root
}

function repository() {
  const root = temporary()
  initFixtureRepo(root, ['-q'])
  execFileSync('git', ['-C', root, 'config', 'user.email', 'test@example.com'])
  execFileSync('git', ['-C', root, 'config', 'user.name', 'Test'])
  writeFileSync(join(root, 'README.md'), 'root\n')
  execFileSync('git', ['-C', root, 'add', 'README.md'])
  execFileSync('git', ['-C', root, 'commit', '-qm', 'root'])
  return root
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

test('the lifecycle lock is exclusive and releases', async () => {
  const root = repository()
  const common = gitCommonDir(root)
  const first = await acquireLock(common, 'lifecycle', { what: 'first', timeoutMs: 1000 })
  await assert.rejects(
    acquireLock(common, 'lifecycle', { what: 'second', timeoutMs: 60 }),
    /another operation holds the lifecycle lock .*pid \d+, token .*expectedOwner=.*/,
  )
  assert.equal(inspectLock(lockPath(common, 'lifecycle')).state, 'alive')
  assert.deepEqual(releaseLock(first), { released: true })
  assert.equal(inspectLock(lockPath(common, 'lifecycle')).state, 'missing')
})

test('different change locks are independent', async () => {
  const root = repository()
  const common = gitCommonDir(root)
  const first = await acquireLock(common, 'change', { change: 'one', timeoutMs: 1000 })
  const second = await acquireLock(common, 'change', { change: 'two', timeoutMs: 1000 })
  assert.equal(inspectLock(lockPath(common, 'change', { change: 'one' })).state, 'alive')
  assert.equal(inspectLock(lockPath(common, 'change', { change: 'two' })).state, 'alive')
  releaseLock(first)
  releaseLock(second)
})

test('the same change lock is serialized', async () => {
  const root = repository()
  const common = gitCommonDir(root)
  const first = await acquireLock(common, 'change', { change: 'demo', timeoutMs: 1000 })
  await assert.rejects(
    acquireLock(common, 'change', { change: 'demo', timeoutMs: 60 }),
    /another operation holds the change lock/,
  )
  releaseLock(first)
})

test('the lifecycle lock cannot be acquired after a change lock', async () => {
  const root = repository()
  const common = gitCommonDir(root)
  const change = await acquireLock(common, 'change', { change: 'demo', timeoutMs: 1000 })
  await assert.rejects(
    acquireLock(common, 'lifecycle', { timeoutMs: 1000 }),
    /lifecycle lock must be acquired before a change lock/,
  )
  assert.equal(inspectLock(lockPath(common, 'lifecycle')).state, 'missing')
  releaseLock(change)
})

test('ordered acquisition takes lifecycle then change', async () => {
  const root = repository()
  const common = gitCommonDir(root)
  const handles = await acquireOrdered(common, { change: 'demo', timeoutMs: 1000 })
  assert.equal(inspectLock(lockPath(common, 'lifecycle')).state, 'alive')
  assert.equal(inspectLock(lockPath(common, 'change', { change: 'demo' })).state, 'alive')
  releaseLock(handles.change)
  releaseLock(handles.lifecycle)
})

test('release leaves a lock whose owner changed', async () => {
  const root = repository()
  const common = gitCommonDir(root)
  const handle = await acquireLock(common, 'change', { change: 'demo', timeoutMs: 1000 })
  const path = lockPath(common, 'change', { change: 'demo' })
  const owner = JSON.parse(readFileSync(join(path, 'owner'), 'utf8'))
  writeFileSync(join(path, 'owner'), `${JSON.stringify({ ...owner, token: 'other' })}\n`)
  const result = releaseLock(handle)
  assert.equal(result.released, false)
  assert.equal(result.owner.token, 'other')
  assert.equal(existsSync(path), true)
  rmSync(path, { recursive: true, force: true })
})

test('a dead owner is recovered by token and a live owner is refused', async () => {
  const root = repository()
  const common = gitCommonDir(root)
  const handle = await acquireLock(common, 'change', { change: 'demo', timeoutMs: 1000 })
  const path = lockPath(common, 'change', { change: 'demo' })
  await assert.rejects(
    Promise.resolve().then(() => recoverLock(common, 'change', { change: 'demo', expectedOwner: handle.owner.token })),
    /held by live process/,
  )
  const owner = JSON.parse(readFileSync(join(path, 'owner'), 'utf8'))
  writeFileSync(join(path, 'owner'), `${JSON.stringify({ ...owner, pid: 2147483647 })}\n`)
  assert.equal(isDeadLock({ held: true, alive: false }), true)
  const recovered = recoverLock(common, 'change', { change: 'demo', expectedOwner: owner.token })
  assert.deepEqual(recovered, { recovered: true, scope: 'change' })
  assert.equal(existsSync(path), false)
})

test('recovery refuses a changed token and a missing owner', async () => {
  const root = repository()
  const common = gitCommonDir(root)
  const handle = await acquireLock(common, 'change', { change: 'demo', timeoutMs: 1000 })
  const path = lockPath(common, 'change', { change: 'demo' })
  const owner = JSON.parse(readFileSync(join(path, 'owner'), 'utf8'))
  writeFileSync(join(path, 'owner'), `${JSON.stringify({ ...owner, pid: 2147483647 })}\n`)
  assert.throws(
    () => recoverLock(common, 'change', { change: 'demo', expectedOwner: 'wrong' }),
    /changed owner/,
  )
  rmSync(path, { recursive: true, force: true })
  assert.throws(
    () => recoverLock(common, 'change', { change: 'demo', expectedOwner: handle.owner.token }),
    /is missing/,
  )
})

test('recovery requires a scope and an owner token', () => {
  const root = repository()
  const common = gitCommonDir(root)
  assert.throws(() => recoverLock(common, 'bogus', { expectedOwner: 'x' }), /unknown lock scope/)
  assert.throws(() => recoverLock(common, 'change', { change: 'demo' }), /requires the expectedOwner token/)
  assert.throws(() => recoverLock(common, 'change', { expectedOwner: 'x' }), /requires a non-empty change/)
})

test('inspection reports corrupt and missing owners', () => {
  const root = repository()
  const common = gitCommonDir(root)
  const path = lockPath(common, 'change', { change: 'demo' })
  assert.equal(inspectLock(path).state, 'missing')
  mkdirSync(join(path, '..'), { recursive: true })
  mkdirSync(path)
  writeFileSync(join(path, 'owner'), 'not json')
  assert.equal(inspectLock(path).state, 'corrupt')
  writeFileSync(join(path, 'owner'), '{}')
  assert.equal(inspectLock(path).state, 'corrupt')
  rmSync(join(path, 'owner'))
  mkdirSync(join(path, 'owner'))
  assert.equal(inspectLock(path).state, 'corrupt')
  rmSync(path, { recursive: true, force: true })
})

test('a dead owner blocks acquisition until explicit recovery', async () => {
  const root = repository()
  const common = gitCommonDir(root)
  const path = lockPath(common, 'change', { change: 'demo' })
  mkdirSync(join(path, '..'), { recursive: true })
  mkdirSync(path)
  writeFileSync(join(path, 'owner'), `${JSON.stringify({ schema: 1, token: 'dead', pid: 2147483647 })}\n`)
  await assert.rejects(
    acquireLock(common, 'change', { change: 'demo', timeoutMs: 100 }),
    /held by dead process 2147483647/,
  )
  rmSync(path, { recursive: true, force: true })
})

test('acquisition rejects a corrupt owner, a missing change and an unknown scope', async () => {
  const root = repository()
  const common = gitCommonDir(root)
  const path = lockPath(common, 'change', { change: 'demo' })
  mkdirSync(join(path, '..'), { recursive: true })
  mkdirSync(path)
  writeFileSync(join(path, 'owner'), 'not json')
  await assert.rejects(acquireLock(common, 'change', { change: 'demo', timeoutMs: 100 }), /no usable owner/)
  await assert.rejects(acquireLock(common, 'change', { timeoutMs: 100 }), /requires a non-empty change/)
  await assert.rejects(acquireLock(common, 'bogus', { timeoutMs: 100 }), /unknown lock scope/)
  rmSync(path, { recursive: true, force: true })
})

test('release of a missing lock is idempotent', () => {
  const root = repository()
  const common = gitCommonDir(root)
  const handle = {
    path: lockPath(common, 'change', { change: 'demo' }),
    scope: 'change',
    commonDir: common,
    owner: { token: 'gone' },
  }
  assert.deepEqual(releaseLock(handle), { released: true })
})

test('ordered acquisition releases the lifecycle lock when the change lock fails', async () => {
  const root = repository()
  const common = gitCommonDir(root)
  const path = lockPath(common, 'change', { change: 'demo' })
  mkdirSync(join(path, '..'), { recursive: true })
  mkdirSync(path)
  writeFileSync(join(path, 'owner'), `${JSON.stringify({ schema: 1, token: 'held', pid: process.pid })}\n`)
  await assert.rejects(acquireOrdered(common, { change: 'demo', timeoutMs: 50 }), /holds the change lock/)
  assert.equal(inspectLock(lockPath(common, 'lifecycle')).state, 'missing')
  rmSync(path, { recursive: true, force: true })
})

test('recover refuses a missing change, missing token, busy recovery and corrupt lock', () => {
  const root = repository()
  const common = gitCommonDir(root)
  assert.throws(() => recoverLock(common, 'change', { expectedOwner: 'x' }), /requires a non-empty change/)
  assert.throws(() => recoverLock(common, 'change', { change: 'demo' }), /requires the expectedOwner token/)
  const path = lockPath(common, 'change', { change: 'demo' })
  mkdirSync(join(path, '..'), { recursive: true })
  mkdirSync(path)
  writeFileSync(join(path, 'owner'), 'not json')
  assert.throws(() => recoverLock(common, 'change', { change: 'demo', expectedOwner: 'x' }), /no usable owner/)
  rmSync(path, { recursive: true, force: true })
  mkdirSync(`${path}.recover.d`)
  assert.throws(
    () => recoverLock(common, 'change', { change: 'demo', expectedOwner: 'x' }),
    /another recovery holds/,
  )
  rmSync(`${path}.recover.d`, { recursive: true, force: true })
})


test('acquisition uses the default timeout for a free lock', async () => {
  const root = repository()
  const common = gitCommonDir(root)
  const handle = await acquireLock(common, 'lifecycle', { what: 'default' })
  assert.deepEqual(releaseLock(handle), { released: true })
})


test('a failed creation leaves no lock path', async () => {
  const root = repository()
  const common = gitCommonDir(root)
  const path = lockPath(common, 'change', { change: 'demo' })
  mkdirSync(dirname(path), { recursive: true })
  chmodSync(dirname(path), 0o555)
  try {
    await assert.rejects(acquireLock(common, 'change', { change: 'demo', timeoutMs: 100 }), /EACCES|EPERM|EROFS/)
  } finally {
    chmodSync(dirname(path), 0o755)
  }
  assert.equal(existsSync(path), false)
})

test('the same owner re-enters with the recorded token', async () => {
  const root = repository()
  const common = gitCommonDir(root)
  const first = await acquireLock(common, 'change', { change: 'demo' })
  const again = await acquireLock(common, 'change', { change: 'demo', reuseToken: first.owner.token })
  assert.equal(again.reused, true)
  assert.equal(again.owner.token, first.owner.token)
  releaseLock(first)
})

test('a dead free lock can be reclaimed by apply', async () => {
  const root = repository()
  const common = gitCommonDir(root)
  const path = lockPath(common, 'change', { change: 'demo' })
  mkdirSync(path, { recursive: true })
  writeFileSync(join(path, 'owner'), `${JSON.stringify({ schema: 1, token: 'dead', pid: 999999, at: new Date().toISOString(), what: 'dead' })}\n`)
  const handle = await acquireLock(common, 'change', { change: 'demo', reclaimDead: true })
  assert.notEqual(handle.owner.token, 'dead')
  assert.equal(inspectLock(path).state, 'alive')
  releaseLock(handle)
})

test('different changes hold independent change locks', async () => {
  const root = repository()
  const common = gitCommonDir(root)
  const first = await acquireLock(common, 'change', { change: 'first' })
  const second = await acquireLock(common, 'change', { change: 'second' })
  assert.notEqual(first.owner.token, second.owner.token)
  assert.equal(inspectLock(first.path).state, 'alive')
  assert.equal(inspectLock(second.path).state, 'alive')
  releaseLock(first)
  releaseLock(second)
})
