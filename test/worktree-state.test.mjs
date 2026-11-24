import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { gitCommonDir, reviewRoot } from '../lib/review/store.js'
import {
  APPLY_STATE_SCHEMA_VERSION, applyStatePath, applyStateRoot, mainWorktreeRoot, readApplyState, writeApplyState,
} from '../lib/worktree/state.js'

const roots = []

function temporary() {
  const root = mkdtempSync(join(tmpdir(), 'openspec-flow-worktree-state-'))
  roots.push(root)
  return root
}

function git(root, args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim()
}

function repository() {
  const root = temporary()
  git(root, ['init', '-q'])
  git(root, ['config', 'user.email', 'test@example.com'])
  git(root, ['config', 'user.name', 'Test'])
  writeFileSync(join(root, 'README.md'), 'root\n')
  git(root, ['add', 'README.md'])
  git(root, ['commit', '-qm', 'root'])
  return root
}

function state(root, extra = {}) {
  return {
    schemaVersion: APPLY_STATE_SCHEMA_VERSION,
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
    lockToken: 'token',
    lockPid: 123,
    ...extra,
  }
}

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

test('applies state under the git common directory and not outside git', () => {
  const root = repository()
  const common = gitCommonDir(root)
  assert.equal(applyStateRoot(root), join(common, 'openspec-flow', 'apply'))
  assert.equal(applyStateRoot(root), join(reviewRoot(root), '..', 'apply'))
  assert.equal(applyStatePath(root, null, 'demo'), join(common, 'openspec-flow', 'apply', 'local#demo.json'))
  const plain = temporary()
  assert.equal(applyStateRoot(plain), undefined)
  assert.equal(applyStatePath(plain, null, 'demo'), undefined)
})

test('state round-trips with the full required field set', () => {
  const root = repository()
  writeApplyState(root, null, 'demo', state(root))
  const loaded = readApplyState(root, null, 'demo')
  assert.deepEqual(loaded, state(root))
})

test('a missing, unknown or invalid field is rejected', () => {
  const root = repository()
  const path = applyStatePath(root, null, 'demo')
  for (const broken of [
    null,
    [],
    { ...state(root), worktree: undefined },
    { ...state(root), extra: true },
    { ...state(root), schemaVersion: 2 },
    { ...state(root), status: 'paused' },
    { ...state(root), store: 7 },
    { ...state(root), sealedCommit: 7 },
    { ...state(root), createdAt: 7 },
    { ...state(root), lockToken: 7 },
    { ...state(root), lockPid: null },
    { ...state(root), lockPid: 0 },
    { ...state(root), status: 'landed' },
  ]) {
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, `${JSON.stringify(broken)}\n`)
    assert.throws(() => readApplyState(root, null, 'demo'), /apply worktree state/)
  }
})

test('safe segments are refused before a state path is written', () => {
  const root = repository()
  for (const value of ['.', '..', 'a/b', 'a\\b', 'a\0b']) {
    assert.throws(() => applyStatePath(root, null, value), /change must be one non-empty path segment/)
  }
  assert.match(applyStatePath(root, null, 'foo..bar'), /local#foo\.\.bar\.json$/u)
  assert.throws(() => applyStatePath(root, 'a/b', 'demo'), /store must be one non-empty path segment/)
  assert.throws(() => applyStatePath(root, null, 'a#b'), /must not contain '#'/)
  assert.throws(() => applyStatePath(root, 'a#b', 'demo'), /must not contain '#'/)
})

test('a state that names another change is rejected', () => {
  const root = repository()
  const path = applyStatePath(root, null, 'demo')
  assert.throws(
    () => writeApplyState(root, null, 'demo', state(root, { change: 'Demo' })),
    /belongs to change 'Demo', not 'demo'/,
  )
  assert.equal(existsSync(path), false)
  // A file another name left behind, e.g. a case variant on a case-insensitive volume.
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, `${JSON.stringify(state(root, { change: 'Demo' }))}\n`)
  assert.throws(() => readApplyState(root, null, 'demo'), /belongs to change 'Demo', not 'demo'/)
})

test('the main worktree root is the main checkout from a linked worktree', () => {
  const root = repository()
  const linked = join(temporary(), 'linked')
  git(root, ['worktree', 'add', '-q', linked, '-b', 'linked'])
  assert.equal(mainWorktreeRoot(linked), root)
  assert.equal(mainWorktreeRoot(root), root)
})

test('a state file keeps the previous bytes when the write fails', () => {
  const root = repository()
  const path = applyStatePath(root, null, 'demo')
  const directory = join(path, '..')
  mkdirSync(directory, { recursive: true })
  writeFileSync(path, `${JSON.stringify(state(root))}\n`)
  chmodSync(directory, 0o555)
  try {
    assert.throws(() => writeApplyState(root, null, 'demo', state(root)), /EACCES|EPERM|EROFS/)
  } finally {
    chmodSync(directory, 0o755)
  }
  assert.equal(readFileSync(path, 'utf8'), `${JSON.stringify(state(root))}\n`)
})


test('a linked worktree reads the state written by the main worktree', () => {
  const root = repository()
  const linked = join(temporary(), 'linked')
  git(root, ['worktree', 'add', '-q', linked, '-b', 'linked'])
  writeApplyState(root, null, 'demo', state(root))
  assert.deepEqual(readApplyState(linked, null, 'demo'), state(root))
})

test('cleanup round-trips and a legacy state reads without it', () => {
  const root = repository()
  const cleanup = {
    worktreeRemoved: true,
    branchRemoved: false,
    at: '2026-01-01T00:00:00.000Z',
    error: 'branch locked',
  }
  writeApplyState(root, null, 'demo', state(root, { cleanup }))
  assert.deepEqual(readApplyState(root, null, 'demo').cleanup, cleanup)
  writeApplyState(root, null, 'demo', state(root))
  assert.equal(readApplyState(root, null, 'demo').cleanup, undefined)
})

test('an unknown cleanup field is refused', () => {
  const root = repository()
  const path = applyStatePath(root, null, 'demo')
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, `${JSON.stringify(state(root, {
    cleanup: { worktreeRemoved: true, branchRemoved: true, bogus: 1 },
  }))}\n`)
  assert.throws(() => readApplyState(root, null, 'demo'), /unknown cleanup field 'bogus'/)
})
