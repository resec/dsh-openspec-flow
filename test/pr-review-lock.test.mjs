import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

import {
  acquireLock,
  assertLockNotHeldByOther,
  assertLockOwnerOrFree,
  forceRelease,
  lockPaths,
  lockStatus,
  main,
  parseArgs,
  readLockOwner,
  releaseLock,
} from '../scripts/pr-review-lock.mjs'
import { mainWorktree, resolvePaths } from '../scripts/pr-review-watch.mjs'

function git(cwd, args) {
  const result = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

function makeRepository() {
  const root = mkdtempSync(join(tmpdir(), 'dsh-pr-review-lock-'))
  git(root, ['init', '-q', '-b', 'main'])
  git(root, ['config', 'user.email', 'test@example.com'])
  git(root, ['config', 'user.name', 'Test'])
  writeFileSync(join(root, 'README.md'), '# lock\n')
  git(root, ['add', '.'])
  git(root, ['commit', '-qm', 'initial'])
  return root
}

function cleanup(...directories) {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true })
}

function writeOwner(root, value) {
  const { directory, owner } = lockPaths(root)
  mkdirSync(directory, { recursive: true })
  writeFileSync(owner, `${JSON.stringify(value, null, 2)}\n`)
}

test('parseArgs and help are strict', () => {
  assert.equal(parseArgs(['--help']).command, 'help')
  assert.deepEqual(parseArgs(['status', '--json']), {
    command: 'status', json: true, session: undefined, token: undefined, pr: undefined, reason: undefined,
  })
  assert.equal(parseArgs(['acquire', '--session', 's1', '--pr', '12']).pr, 12)
  assert.equal(parseArgs(['acquire', '--owner-session', 's1', '--pr', '12']).session, 's1')
  assert.equal(parseArgs(['release', '--session', 's1', '--token', 't']).token, 't')
  assert.throws(() => parseArgs(['acquire']), /needs --session/)
  assert.throws(() => parseArgs(['acquire', '--session', 's']), /positive --pr/)
  assert.throws(() => parseArgs(['force-release']), /needs --reason/)
  assert.throws(() => parseArgs(['nope']), /unknown command/)
  assert.throws(() => parseArgs(['status', '--session']), /needs a value/)
  let output = ''
  assert.equal(main(['--help'], (text) => { output += text }), 0)
  assert.match(output, /usage: node scripts\/pr-review-lock\.mjs/)
  assert.equal(main(['nope'], (text) => { output += text }), 2)
})

test('acquire, status and release resolve the main worktree cache', () => {
  const root = makeRepository()
  try {
    const owner = acquireLock({ root, session: 'owner-1', token: 'token-1', pr: 12 })
    assert.equal(owner.ownerSession, 'owner-1')
    assert.equal(owner.token, 'token-1')
    assert.equal(owner.pr, 12)
    const { directory } = lockPaths(root)
    assert.equal(directory, join(root, '.cache', 'pr-review', 'landing.lock'))
    assert.equal(existsSync(join(directory, 'owner.json')), true)
    assert.equal(resolvePaths(root).landingLock, directory)
    const status = lockStatus({ root, now: Date.parse(owner.at) + 60_000 })
    assert.equal(status.held, true)
    assert.equal(status.ownerSession, 'owner-1')
    assert.equal(status.ageMinutes, 1)
    assert.equal(status.stale, false)
    assert.equal(status.ttlMinutes, 120)
    assert.equal(readLockOwner(root).pr, 12)
    const released = releaseLock({ root, session: 'owner-1', token: 'token-1' })
    assert.deepEqual(released, { released: true, ownerSession: 'owner-1', pr: 12 })
    assert.equal(existsSync(directory), false)
    assert.deepEqual(releaseLock({ root, session: 'owner-1', token: 'token-1' }), { released: false, reason: 'free' })
  } finally {
    cleanup(root)
  }
})

test('the lock is exclusive and only the recorded owner retries', () => {
  const root = makeRepository()
  try {
    acquireLock({ root, session: 'owner-1', token: 'token-1', pr: 12 })
    assert.throws(() => acquireLock({ root, session: 'owner-2', pr: 13 }), /held by session owner-1 for PR #12/)
    assert.throws(() => acquireLock({ root, session: 'owner-1', token: 'token-2', pr: 12 }), /held by session owner-1/)
    const same = acquireLock({ root, session: 'owner-1', token: 'token-1', pr: 12 })
    assert.equal(same.token, 'token-1')
    assert.equal(assertLockOwnerOrFree({ root, session: 'owner-1', token: 'token-1' }).pr, 12)
    assert.throws(() => assertLockOwnerOrFree({ root, session: 'owner-1', token: 'wrong' }), /held by session owner-1/)
    assert.throws(() => assertLockNotHeldByOther({ root, session: 'owner-2' }), /held by session owner-1/)
    assert.equal(assertLockNotHeldByOther({ root, session: 'owner-1' }).pr, 12)
    assert.throws(() => releaseLock({ root, session: 'owner-1', token: 'wrong' }), /does not match/)
  } finally {
    cleanup(root)
  }
})

test('a stale lock is reported and released only explicitly', () => {
  const root = makeRepository()
  try {
    const old = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
    acquireLock({ root, session: 'gone', token: 'stale-token', pr: 12, now: old })
    const status = lockStatus({ root })
    assert.equal(status.held, true)
    assert.equal(status.stale, true)
    assert.ok(status.ageMinutes >= 180)
    assert.equal(status.ownerSession, 'gone')
    assert.throws(() => acquireLock({ root, session: 'new-owner', pr: 13 }), /held by session gone/)
    const forced = forceRelease({ root, reason: 'owner session ended' })
    assert.deepEqual(forced, { released: true, ownerSession: 'gone', pr: 12, reason: 'owner session ended' })
    assert.equal(lockStatus({ root }).held, false)
  } finally {
    cleanup(root)
  }
})

test('a corrupt lock is refused instead of discarded', () => {
  const root = makeRepository()
  try {
    const { directory, owner } = lockPaths(root)
    mkdirSync(directory, { recursive: true })
    assert.throws(() => readLockOwner(root), /corrupt: owner file missing/)
    writeFileSync(owner, '{not json')
    assert.throws(() => readLockOwner(root), /corrupt/)
    rmSync(directory, { recursive: true, force: true })
    writeOwner(root, { ownerSession: '', token: 't', pr: 12, at: new Date().toISOString() })
    assert.throws(() => readLockOwner(root), /corrupt/)
    writeOwner(root, { ownerSession: 's', token: 't', pr: 0, at: new Date().toISOString() })
    assert.throws(() => readLockOwner(root), /corrupt/)
    writeOwner(root, { ownerSession: 's', token: 't', pr: 12, at: 'not-a-date' })
    assert.throws(() => readLockOwner(root), /corrupt/)
    assert.throws(() => lockStatus({ root }), /corrupt/)
  } finally {
    cleanup(root)
  }
})

test('the lock resolves against the main worktree from a linked checkout', () => {
  const root = makeRepository()
  try {
    const linked = join(root, '.cache', 'linked')
    mkdirSync(join(root, '.cache'), { recursive: true })
    git(root, ['worktree', 'add', '-q', '--detach', linked, 'HEAD'])
    assert.equal(mainWorktree(linked), root)
    assert.equal(resolvePaths(mainWorktree(linked)).landingLock, lockPaths(root).directory)
    acquireLock({ root: mainWorktree(linked), session: 'linked-owner', pr: 12 })
    assert.equal(readLockOwner(root).ownerSession, 'linked-owner')
    assert.equal(existsSync(join(linked, '.cache', 'pr-review', 'landing.lock')), false)
  } finally {
    cleanup(root)
  }
})

test('acquire requires a positive PR and release needs the owner pair', () => {
  const root = makeRepository()
  try {
    assert.throws(() => acquireLock({ root, session: 's' }), /positive --pr/)
    acquireLock({ root, session: 's', pr: 12 })
    assert.throws(() => releaseLock({ root, session: 's' }), /does not match/)
    assert.throws(() => forceRelease({ root, reason: ' ' }), /needs --reason/)
    const wrote = readFileSync(lockPaths(root).owner, 'utf8')
    assert.match(wrote, /"ownerSession": "s"/)
  } finally {
    cleanup(root)
  }
})
