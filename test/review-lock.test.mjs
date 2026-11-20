import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  LOCK_FIELDS,
  acquireApplyLocks,
  acquireStoreApplyLock,
  applyLockBlocker,
  applyLockBlockedError,
  applyLockDomains,
  applyLockIsStale,
  applyLockLocation,
  applyLockMatches,
  applyLockPath,
  gitWorktreeDirectory,
  gitWorktreeRoot,
  inspectApplyLocks,
  implementationRootOf,
  nearestProjectRoot,
  readApplyLock,
  releaseApplyLocks,
} from '../lib/review/apply-lock.js'
import { filterUnrelatedChangeStatus, statusLinePath } from '../lib/review/store.js'

const CREATED = []

function temporary() {
  const root = mkdtempSync(join(tmpdir(), 'openspec-flow-lock-'))
  mkdirSync(join(root, 'openspec'), { recursive: true })
  CREATED.push(root)
  return root
}

function gitTemporary() {
  const root = temporary()
  runGit(root, ['init'])
  runGit(root, ['config', 'user.email', 'test@example.com'])
  runGit(root, ['config', 'user.name', 'Test'])
  mkdirSync(join(root, 'openspec', 'changes', 'demo'), { recursive: true })
  writeFileSync(join(root, 'openspec', 'config.yaml'), 'schema: spec-driven\n')
  writeFileSync(join(root, 'openspec', 'changes', 'demo', '.openspec.yaml'), 'schema: spec-driven\n')
  runGit(root, ['add', 'openspec'])
  runGit(root, ['commit', '-m', 'fixture'])
  return root
}

function runGit(root, args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

function options(root, extra = {}) {
  return {
    cwd: root,
    resolvedRoot: root,
    change: 'demo',
    changeRoot: join(root, 'openspec', 'changes', 'demo'),
    ...extra,
  }
}

test.after(() => {
  for (const root of CREATED) rmSync(root, { recursive: true, force: true })
})

test('a non-git project stores the lock under openspec/.review', () => {
  const root = temporary()
  mkdirSync(join(root, 'openspec', 'changes', 'demo'), { recursive: true })
  const result = acquireApplyLocks(options(root))
  assert.equal(result.locks.length, 1)
  assert.equal(result.created.length, 1)
  const lock = result.locks[0]
  assert.equal(lock.file, join(root, 'openspec', '.review', 'apply.lock.json'))
  const record = readApplyLock(lock.file)
  for (const field of LOCK_FIELDS) assert.ok(Object.hasOwn(record, field), field)
  assert.equal(record.change, 'demo')
  assert.equal(record.store, null)
  assert.equal(record.implementationRoot, root)
  assert.equal(record.changeRoot, join(root, 'openspec', 'changes', 'demo'))
  assert.ok(existsSync(join(root, 'openspec', '.gitignore')))
  releaseApplyLocks(result.locks)
  assert.equal(existsSync(lock.file), false)
})

test('the same change re-enters without creating a new lock', () => {
  const root = temporary()
  mkdirSync(join(root, 'openspec', 'changes', 'demo'), { recursive: true })
  const first = acquireApplyLocks(options(root))
  const second = acquireApplyLocks(options(root))
  assert.equal(second.created.length, 0)
  assert.equal(second.locks.length, 1)
  releaseApplyLocks(second.locks)
  assert.equal(existsSync(first.locks[0].file), false)
})

test('another change is refused and named', () => {
  const root = temporary()
  mkdirSync(join(root, 'openspec', 'changes', 'demo'), { recursive: true })
  mkdirSync(join(root, 'openspec', 'changes', 'other'), { recursive: true })
  const held = acquireApplyLocks(options(root))
  assert.throws(
    () => acquireApplyLocks(options(root, {
      change: 'other',
      changeRoot: join(root, 'openspec', 'changes', 'other'),
    })),
    /local#demo/,
  )
  releaseApplyLocks(held.locks)
})

test('a same-named change in another store is refused', () => {
  const root = temporary()
  mkdirSync(join(root, 'openspec', 'changes', 'demo'), { recursive: true })
  const held = acquireApplyLocks(options(root))
  assert.throws(
    () => acquireApplyLocks(options(root, { store: 'team' })),
    /local#demo/,
  )
  releaseApplyLocks(held.locks)
})

test('a stale lock is replaced', () => {
  const root = temporary()
  mkdirSync(join(root, 'openspec', 'changes', 'demo'), { recursive: true })
  mkdirSync(join(root, 'openspec', 'changes', 'other'), { recursive: true })
  const held = acquireApplyLocks(options(root))
  const file = held.locks[0].file
  const record = readApplyLock(file)
  record.changeRoot = join(root, 'openspec', 'changes', 'missing')
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`)
  assert.equal(applyLockIsStale(record), true)
  const result = acquireApplyLocks(options(root, {
    change: 'other',
    changeRoot: join(root, 'openspec', 'changes', 'other'),
  }))
  assert.equal(result.created.length, 1)
  assert.equal(readApplyLock(file).change, 'other')
  releaseApplyLocks(result.locks)
})

test('a vanished implementation root makes a store lock stale', () => {
  const project = temporary()
  const store = temporary()
  const storeChange = join(store, 'openspec', 'changes', 'demo')
  mkdirSync(storeChange, { recursive: true })
  mkdirSync(join(project, 'openspec', 'changes'), { recursive: true })
  const held = acquireApplyLocks({
    cwd: project,
    resolvedRoot: store,
    store: 'team',
    change: 'demo',
    changeRoot: storeChange,
    implementationRoot: project,
  })
  const storeLock = held.locks.find((lock) => lock.kind === 'store')
  assert.ok(storeLock)
  const record = readApplyLock(storeLock.file)
  assert.equal(record.implementationRoot, project)
  record.implementationRoot = join(project, 'gone')
  writeFileSync(storeLock.file, `${JSON.stringify(record, null, 2)}\n`)
  assert.equal(applyLockIsStale(record), true)
  const next = acquireApplyLocks({
    cwd: project,
    resolvedRoot: store,
    store: 'team',
    change: 'demo',
    changeRoot: storeChange,
    implementationRoot: project,
  })
  assert.equal(readApplyLock(storeLock.file).implementationRoot, project)
  releaseApplyLocks(next.locks)
})

test('a git project keeps the lock in the git directory and the tree clean', () => {
  const root = gitTemporary()
  const result = acquireApplyLocks(options(root))
  const lock = result.locks[0]
  assert.equal(lock.git, true)
  assert.equal(lock.file, join(root, runGit(root, ['rev-parse', '--git-dir']), 'openspec-flow', 'apply.lock.json'))
  assert.equal(runGit(root, ['status', '--porcelain']), '')
  releaseApplyLocks(result.locks)
})

test('a store change takes both the implementation and store locks', () => {
  const project = gitTemporary()
  const store = temporary()
  const storeChange = join(store, 'openspec', 'changes', 'demo')
  mkdirSync(storeChange, { recursive: true })
  const result = acquireApplyLocks({
    cwd: project,
    resolvedRoot: store,
    store: 'team',
    change: 'demo',
    changeRoot: storeChange,
    implementationRoot: project,
  })
  assert.equal(result.locks.length, 2)
  assert.deepEqual(result.locks.map((lock) => lock.kind), ['implementation', 'store'])
  const storeLock = result.locks.find((lock) => lock.kind === 'store')
  assert.equal(storeLock.file, join(store, 'openspec', '.review', 'apply.lock.json'))
  assert.equal(readApplyLock(storeLock.file).implementationRoot, project)
  releaseApplyLocks(result.locks)
  for (const lock of result.locks) assert.equal(existsSync(lock.file), false)
})

test('a second project applying the same store change is refused and rolls back', () => {
  const project = gitTemporary()
  const other = gitTemporary()
  const store = temporary()
  const storeChange = join(store, 'openspec', 'changes', 'demo')
  mkdirSync(storeChange, { recursive: true })
  const held = acquireApplyLocks({
    cwd: project,
    resolvedRoot: store,
    store: 'team',
    change: 'demo',
    changeRoot: storeChange,
    implementationRoot: project,
  })
  assert.throws(() => acquireApplyLocks({
    cwd: other,
    resolvedRoot: store,
    store: 'team',
    change: 'demo',
    changeRoot: storeChange,
    implementationRoot: other,
  }), /team#demo/)
  const otherLock = applyLockLocation(other)
  assert.equal(existsSync(otherLock.file), false)
  releaseApplyLocks(held.locks)
})

test('a partially acquired set is released when a later lock is held', () => {
  const project = gitTemporary()
  const store = temporary()
  const storeChange = join(store, 'openspec', 'changes', 'demo')
  mkdirSync(storeChange, { recursive: true })
  const storeLock = applyLockLocation(store)
  mkdirSync(storeLock.directory, { recursive: true })
  writeFileSync(storeLock.file, `${JSON.stringify({
    schemaVersion: 1,
    change: 'other',
    store: 'team',
    changeRoot: storeChange,
    implementationRoot: project,
    startedAt: new Date().toISOString(),
  }, null, 2)}\n`)
  assert.throws(() => acquireApplyLocks({
    cwd: project,
    resolvedRoot: store,
    store: 'team',
    change: 'demo',
    changeRoot: storeChange,
    implementationRoot: project,
  }), /team#other/)
  const projectLock = applyLockLocation(project)
  assert.equal(existsSync(projectLock.file), false)
})

test('inspection reports mine, stale and blocker without writing', () => {
  const root = temporary()
  mkdirSync(join(root, 'openspec', 'changes', 'demo'), { recursive: true })
  mkdirSync(join(root, 'openspec', 'changes', 'other'), { recursive: true })
  const held = acquireApplyLocks(options(root))
  const before = readFileSync(held.locks[0].file, 'utf8')
  const mine = inspectApplyLocks(options(root))
  assert.equal(mine.locks[0].mine, true)
  assert.equal(mine.locks[0].stale, false)
  const other = inspectApplyLocks(options(root, {
    change: 'other',
    changeRoot: join(root, 'openspec', 'changes', 'other'),
  }))
  assert.equal(other.locks[0].mine, false)
  assert.equal(readFileSync(held.locks[0].file, 'utf8'), before)
  releaseApplyLocks(held.locks)
})

test('a store change and a local change share the implementation lock', () => {
  const project = gitTemporary()
  const store = temporary()
  const storeChange = join(store, 'openspec', 'changes', 'demo')
  mkdirSync(storeChange, { recursive: true })
  mkdirSync(join(project, 'openspec', 'changes', 'local'), { recursive: true })
  const held = acquireApplyLocks({
    cwd: project,
    resolvedRoot: store,
    store: 'team',
    change: 'demo',
    changeRoot: storeChange,
    implementationRoot: project,
  })
  assert.throws(() => acquireApplyLocks({
    cwd: project,
    resolvedRoot: project,
    change: 'local',
    changeRoot: join(project, 'openspec', 'changes', 'local'),
  }), /team#demo/)
  releaseApplyLocks(held.locks)
})

test('nested OpenSpec roots share one worktree lock', () => {
  const root = gitTemporary()
  mkdirSync(join(root, 'packages', 'x', 'openspec', 'changes', 'demo'), { recursive: true })
  mkdirSync(join(root, 'packages', 'y', 'openspec', 'changes', 'other'), { recursive: true })
  const held = acquireApplyLocks({
    cwd: join(root, 'packages', 'x'),
    resolvedRoot: join(root, 'packages', 'x'),
    change: 'demo',
    changeRoot: join(root, 'packages', 'x', 'openspec', 'changes', 'demo'),
  })
  assert.equal(held.locks[0].root, root)
  assert.throws(() => acquireApplyLocks({
    cwd: join(root, 'packages', 'y'),
    resolvedRoot: join(root, 'packages', 'y'),
    change: 'other',
    changeRoot: join(root, 'packages', 'y', 'openspec', 'changes', 'other'),
  }), /local#demo/)
  releaseApplyLocks(held.locks)
})

test('linked worktrees take separate locks', () => {
  const root = gitTemporary()
  const linked = mkdtempSync(join(tmpdir(), 'openspec-flow-linked-'))
  CREATED.push(linked)
  runGit(root, ['worktree', 'add', linked, '-b', 'linked-branch'])
  const first = acquireApplyLocks(options(root))
  const second = acquireApplyLocks({
    cwd: linked,
    resolvedRoot: linked,
    change: 'other',
    changeRoot: join(linked, 'openspec', 'changes', 'demo'),
  })
  assert.notEqual(first.locks[0].file, second.locks[0].file)
  assert.equal(existsSync(first.locks[0].file), true)
  assert.equal(existsSync(second.locks[0].file), true)
  releaseApplyLocks(first.locks)
  releaseApplyLocks(second.locks)
})

test('a held review-directory lock refuses a second write', () => {
  const root = temporary()
  mkdirSync(join(root, 'openspec', 'changes', 'demo'), { recursive: true })
  const location = applyLockLocation(root)
  mkdirSync(join(location.directory, '.lock'))
  try {
    assert.throws(() => acquireApplyLocks(options(root)), /another write holds/)
  } finally {
    rmSync(join(location.directory, '.lock'), { recursive: true, force: true })
  }
})

test('the lock identity compares the store and, for a store lock, the implementation root', () => {
  const identity = {
    change: 'demo',
    store: 'team',
    changeRoot: '/tmp/change',
    implementationRoot: '/tmp/project',
  }
  assert.equal(applyLockMatches({ ...identity, store: 'team' }, identity, 'implementation'), true)
  assert.equal(applyLockMatches({ ...identity, store: 'team' }, identity, 'store'), true)
  assert.equal(applyLockMatches({ ...identity, store: 'other' }, identity, 'store'), false)
  assert.equal(applyLockMatches({ ...identity, implementationRoot: '/tmp/other' }, identity, 'store'), false)
  assert.equal(applyLockMatches({ ...identity, implementationRoot: '/tmp/other' }, identity, 'implementation'), true)
})

test('the implementation root follows the worktree before the OpenSpec root', () => {
  const root = gitTemporary()
  assert.equal(implementationRootOf(join(root, 'openspec'), root), root)
  const plain = temporary()
  assert.equal(implementationRootOf(plain, plain), plain)
})

test('status filtering drops other changes but keeps the change and code', () => {
  const status = [
    ' M openspec/changes/demo/proposal.md',
    '?? openspec/changes/other/',
    ' M src/app.ts',
    '?? notes.txt',
  ].join('\n')
  assert.deepEqual(filterUnrelatedChangeStatus(status, 'openspec/changes/demo'), [
    ' M openspec/changes/demo/proposal.md',
    ' M src/app.ts',
    '?? notes.txt',
  ])
  const nested = [
    ' M packages/x/openspec/changes/demo/specs/theme/spec.md',
    ' M packages/x/openspec/changes/other/specs/theme/spec.md',
    ' M packages/x/src/app.ts',
  ].join('\n')
  assert.deepEqual(
    filterUnrelatedChangeStatus(nested, 'packages/x/openspec/changes/demo'),
    [
      ' M packages/x/openspec/changes/demo/specs/theme/spec.md',
      ' M packages/x/src/app.ts',
    ],
  )
})

test('domain and location helpers handle missing roots and nested paths', () => {
  const root = temporary()
  assert.equal(nearestProjectRoot(join(root, 'nested', 'deep')), root)
  assert.equal(nearestProjectRoot(''), undefined)
  const empty = mkdtempSync(join(tmpdir(), 'openspec-flow-empty-'))
  CREATED.push(empty)
  assert.equal(nearestProjectRoot(empty), undefined)
  assert.equal(gitWorktreeRoot(empty), undefined)
  assert.equal(gitWorktreeDirectory(empty), undefined)
  assert.equal(gitWorktreeRoot(root), undefined)
  assert.equal(applyLockPath(empty), join(empty, 'openspec', '.review', 'apply.lock.json'))
  rmSync(join(root, 'openspec', '.review'), { recursive: true, force: true })
  const location = applyLockLocation(root, false)
  assert.equal(existsSync(location.directory), false)
  assert.equal(location.git, false)
})

test('domain resolution skips a duplicate store domain', () => {
  const root = temporary()
  assert.deepEqual(
    applyLockDomains({ cwd: root, resolvedRoot: root, store: 'team', implementationRoot: root }),
    [{ kind: 'implementation', root }],
  )
})

test('identity and staleness helpers cover damaged records', () => {
  assert.equal(applyLockMatches(undefined, {}, 'implementation'), false)
  assert.equal(applyLockMatches({}, { change: 'x', store: undefined }, 'implementation'), false)
  assert.equal(applyLockMatches({ change: 'x', store: '' }, { change: 'x', store: undefined }, 'implementation'), true)
  assert.equal(applyLockIsStale(undefined), true)
  assert.equal(applyLockIsStale({ changeRoot: '/gone', implementationRoot: '/tmp' }), true)
  assert.equal(applyLockIsStale({ changeRoot: '/tmp', implementationRoot: '' }), true)
})

test('blocked errors name the holder for both store and local locks', () => {
  const local = applyLockBlockedError({
    kind: 'implementation',
    file: '/tmp/lock.json',
    record: { change: 'demo', store: null, implementationRoot: '/tmp/proj' },
  })
  assert.match(local.message, /local#demo/)
  assert.match(local.message, /ask the user/)
  const store = applyLockBlockedError({
    kind: 'store',
    file: '/tmp/lock.json',
    record: { change: 'demo', store: 'team', implementationRoot: '/tmp/proj' },
  })
  assert.match(store.message, /team#demo/)
})

test('inspection reads missing locks without writing', () => {
  const root = temporary()
  mkdirSync(join(root, 'openspec', 'changes', 'demo'), { recursive: true })
  const before = existsSync(join(root, 'openspec', '.review'))
  const inspected = inspectApplyLocks(options(root))
  assert.equal(inspected.locks[0].record, undefined)
  assert.equal(inspected.locks[0].stale, false)
  assert.equal(inspected.locks[0].mine, false)
  assert.equal(applyLockBlocker(inspected), undefined)
  assert.equal(existsSync(join(root, 'openspec', '.review')), before)
  releaseApplyLocks(undefined)
  releaseApplyLocks([{ file: 42 }])
})

test('status parsing handles renames, quotes and empty lines', () => {
  assert.equal(statusLinePath(''), '')
  assert.equal(statusLinePath('R  old -> new'), 'new')
  assert.equal(statusLinePath('?? "space name"'), 'space name')
  assert.deepEqual(filterUnrelatedChangeStatus('', ''), [])
  assert.deepEqual(filterUnrelatedChangeStatus(' M openspec/changes/other/x.md\n', ''), [])
})

test('implementation root falls back when no OpenSpec root exists', () => {
  const empty = mkdtempSync(join(tmpdir(), 'openspec-flow-empty-'))
  CREATED.push(empty)
  assert.equal(implementationRootOf(empty, empty), empty)
})

test('two store changes from different stores serialize in one project', () => {
  const project = gitTemporary()
  const storeA = temporary()
  const storeB = temporary()
  const changeA = join(storeA, 'openspec', 'changes', 'a')
  const changeB = join(storeB, 'openspec', 'changes', 'b')
  mkdirSync(changeA, { recursive: true })
  mkdirSync(changeB, { recursive: true })
  const held = acquireApplyLocks({
    cwd: project,
    resolvedRoot: storeA,
    store: 'team-a',
    change: 'a',
    changeRoot: changeA,
    implementationRoot: project,
  })
  assert.throws(() => acquireApplyLocks({
    cwd: project,
    resolvedRoot: storeB,
    store: 'team-b',
    change: 'b',
    changeRoot: changeB,
    implementationRoot: project,
  }), /team-a#a/)
  releaseApplyLocks(held.locks)
})


test('a worktree apply acquires only the store-domain lock', () => {
  const implementation = temporary()
  const storeRoot = temporary()
  mkdirSync(join(implementation, 'openspec'), { recursive: true })
  mkdirSync(join(storeRoot, 'openspec'), { recursive: true })
  const changeRoot = join(implementation, 'openspec', 'changes', 'demo')
  mkdirSync(changeRoot, { recursive: true })
  const acquired = acquireStoreApplyLock({
    cwd: implementation,
    resolvedRoot: storeRoot,
    store: 'team',
    change: 'demo',
    changeRoot,
  })
  assert.equal(acquired.locks.length, 1)
  assert.equal(acquired.locks[0].kind, 'store')
  assert.equal(acquired.created.length, 1)
  releaseApplyLocks(acquired.created)
})
