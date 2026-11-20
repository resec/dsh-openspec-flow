import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  clearGitRootCache, ensureReviewIgnored, gitCommonDir, gitTopLevel, legacyReviewDirectory, reviewDirectory, reviewRecordName, reviewRoot,
} from '../lib/review/store.js'

const roots = []

function temporary() {
  const root = mkdtempSync(join(tmpdir(), 'openspec-flow-store-root-'))
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

test.after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

test('a non-git project keeps the legacy root', () => {
  const root = temporary()
  assert.equal(reviewRoot(root), join(root, 'openspec', '.review'))
  assert.equal(reviewDirectory(root, null, 'demo'), join(root, 'openspec', '.review', 'local#demo'))
})

test('a git project uses the common directory', () => {
  const root = repository()
  const common = git(root, ['rev-parse', '--path-format=absolute', '--git-common-dir'])
  assert.equal(reviewRoot(root), join(common, 'openspec-flow', 'review'))
  assert.equal(reviewDirectory(root, null, 'demo'), join(common, 'openspec-flow', 'review', 'local#demo'))
})

test('a linked worktree resolves the same record as the main worktree', () => {
  const root = repository()
  const linked = join(temporary(), 'linked')
  git(root, ['worktree', 'add', '-q', linked, '-b', 'linked'])
  assert.equal(reviewDirectory(linked, null, 'demo'), reviewDirectory(root, null, 'demo'))
})

test('two nested roots with the same change get distinct records', () => {
  const root = repository()
  const left = join(root, 'left')
  const right = join(root, 'right')
  mkdirSync(left)
  mkdirSync(right)
  const first = reviewDirectory(left, null, 'demo')
  const second = reviewDirectory(right, null, 'demo')
  assert.notEqual(first, second)
  assert.match(first, /local#demo@root-[0-9a-f]{12}$/u)
  assert.match(second, /local#demo@root-[0-9a-f]{12}$/u)
})

test('a legacy record is copied once and a removed shared record stays removed', () => {
  const root = repository()
  const legacy = legacyReviewDirectory(root, null, 'demo')
  mkdirSync(legacy, { recursive: true })
  writeFileSync(join(legacy, 'policy.json'), '{"change":"demo"}\n')
  const shared = reviewDirectory(root, null, 'demo')
  assert.ok(existsSync(join(shared, 'policy.json')))
  rmSync(shared, { recursive: true, force: true })
  assert.equal(reviewDirectory(root, null, 'demo'), shared)
  assert.equal(existsSync(shared), false)
})

test('the shared root skips the legacy ignore write', () => {
  const root = repository()
  const shared = reviewDirectory(root, null, 'demo')
  ensureReviewIgnored(root, shared)
  assert.equal(existsSync(join(root, 'openspec', '.gitignore')), false)
})

test('the legacy root keeps its ignore write', () => {
  const root = temporary()
  ensureReviewIgnored(root, join(root, 'openspec', '.review'))
  assert.match(execFileSync('cat', [join(root, 'openspec', '.gitignore')], { encoding: 'utf8' }), /^\.review\/$/mu)
})


test('a busy migration lock reports an actionable error', () => {
  const root = repository()
  const legacy = legacyReviewDirectory(root, null, 'demo')
  mkdirSync(legacy, { recursive: true })
  writeFileSync(join(legacy, 'policy.json'), '{}\n')
  const lock = join(reviewRoot(root), '.migrate', `${reviewRecordName(root, null, 'demo')}.lock`)
  mkdirSync(lock, { recursive: true })
  assert.throws(() => reviewDirectory(root, null, 'demo'), /migration is busy/u)
})


test('an existing shared record wins over the legacy copy', () => {
  const root = repository()
  const legacy = legacyReviewDirectory(root, null, 'demo')
  mkdirSync(legacy, { recursive: true })
  writeFileSync(join(legacy, 'policy.json'), 'legacy\n')
  const shared = reviewDirectory(root, null, 'demo')
  writeFileSync(join(shared, 'policy.json'), 'shared\n')
  writeFileSync(join(legacy, 'policy.json'), 'legacy-updated\n')
  assert.equal(reviewDirectory(root, null, 'demo'), shared)
  assert.equal(existsSync(shared), true)
  assert.match(execFileSync('cat', [join(shared, 'policy.json')], { encoding: 'utf8' }), /^shared$/mu)
  assert.deepEqual(readdirSync(join(reviewRoot(root), '.migrate')).filter((name) => name.includes('.tmp-')), [])
})

test('a symlinked nested root keeps a distinct record name', () => {
  const root = repository()
  const nested = join(root, 'nested')
  mkdirSync(nested)
  const link = join(root, 'link')
  symlinkSync(nested, link, 'dir')
  const viaLink = reviewDirectory(link, null, 'demo')
  const direct = reviewDirectory(nested, null, 'demo')
  assert.equal(viaLink, direct)
  assert.notEqual(viaLink, reviewDirectory(root, null, 'demo'))
})

test('git root resolution is cached per project root until cleared', () => {
  clearGitRootCache()
  const root = temporary()
  let calls = 0
  const run = (_command, args) => {
    calls += 1
    return { status: 0, stdout: args.includes('--git-common-dir') ? '/tmp/common\n' : '/tmp/top\n' }
  }
  assert.equal(gitCommonDir(root, run), '/tmp/common')
  assert.equal(gitCommonDir(root, run), '/tmp/common')
  assert.equal(calls, 1)
  assert.equal(gitTopLevel(root, run), '/tmp/top')
  assert.equal(gitTopLevel(root, run), '/tmp/top')
  assert.equal(calls, 2)
  clearGitRootCache()
  assert.equal(gitCommonDir(root, run), '/tmp/common')
  assert.equal(calls, 3)
})
