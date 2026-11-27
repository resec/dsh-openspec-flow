/**
 * The seal-path overlay used to rebuild an apply review's diff origin.
 *
 * A draft review starts its diff at the sealed plan on the branch point. When
 * the branch takes in newer main, that origin is rebuilt by overlaying the
 * paths the seal commit changed onto the fork tree. These tests build the
 * three inputs with real commits and check the resulting tree, including a
 * path with a space, a path whose content already matches on the fork, and a
 * path the seal removed.
 */

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { overlaySealTree } from '../lib/worktree/seal.js'
import { resolveApplyBase } from '../lib/review/base.js'

const CREATED = []

/** Run git in the fixture and return its trimmed stdout. */
function run(root, args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' })
  assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr}`)
  return result.stdout.trim()
}

/** Create an empty repository with a local identity. */
function repo() {
  const root = mkdtempSync(join(tmpdir(), 'openspec-flow-overlay-'))
  CREATED.push(root)
  run(root, ['init', '-q'])
  run(root, ['config', 'user.email', 'test@example.com'])
  run(root, ['config', 'user.name', 'Test'])
  return root
}

/** Stage everything and commit, returning the new commit. */
function commit(root, message) {
  run(root, ['add', '-A'])
  run(root, ['commit', '-qm', message])
  return run(root, ['rev-parse', 'HEAD'])
}

/** The repository-relative paths a tree carries. */
function treePaths(root, tree) {
  return run(root, ['ls-tree', '-r', '-z', '--name-only', tree]).split('\0').filter(Boolean)
}

test.after(() => {
  for (const root of CREATED) rmSync(root, { recursive: true, force: true })
})

test('the overlay carries the seal paths and the fork content', () => {
  const root = repo()
  mkdirSync(join(root, 'openspec'), { recursive: true })
  writeFileSync(join(root, 'openspec', '.gitignore'), '.review/\n')
  const base = commit(root, 'base')
  mkdirSync(join(root, 'openspec', 'changes', 'widget', 'specs'), { recursive: true })
  writeFileSync(join(root, 'openspec', 'changes', 'widget', 'proposal.md'), '# Proposal\n')
  writeFileSync(join(root, 'openspec', 'changes', 'widget', 'specs', 'with space.md'), '# Spec\n')
  const seal = commit(root, 'seal')
  run(root, ['checkout', '-q', base])
  writeFileSync(join(root, 'main-only.txt'), 'landed\n')
  const fork = commit(root, 'main advance')

  const tree = overlaySealTree({ root, sealCommit: seal, onto: fork })
  assert.ok(tree, 'the overlay tree is built')
  assert.deepEqual(treePaths(root, tree).sort(), [
    'main-only.txt',
    'openspec/.gitignore',
    'openspec/changes/widget/proposal.md',
    'openspec/changes/widget/specs/with space.md',
  ].sort())
  assert.deepEqual(run(root, ['diff', '--name-only', fork, tree]).split('\n').filter(Boolean).sort(), [
    'openspec/changes/widget/proposal.md',
    'openspec/changes/widget/specs/with space.md',
  ])
})

test('a path whose fork content already equals the seal is accepted', () => {
  const root = repo()
  mkdirSync(join(root, 'openspec'), { recursive: true })
  writeFileSync(join(root, 'openspec', '.gitignore'), 'a\n')
  const base = commit(root, 'base')
  writeFileSync(join(root, 'openspec', '.gitignore'), 'b\n')
  mkdirSync(join(root, 'openspec', 'changes', 'widget'), { recursive: true })
  writeFileSync(join(root, 'openspec', 'changes', 'widget', 'proposal.md'), '# Proposal\n')
  const seal = commit(root, 'seal')
  run(root, ['checkout', '-q', base])
  writeFileSync(join(root, 'openspec', '.gitignore'), 'b\n')
  writeFileSync(join(root, 'main-only.txt'), 'landed\n')
  const fork = commit(root, 'main advance')

  const tree = overlaySealTree({ root, sealCommit: seal, onto: fork })
  assert.ok(tree, 'the converging path does not refuse the overlay')
  const changed = run(root, ['diff', '--name-only', fork, tree]).split('\n').filter(Boolean)
  assert.ok(!changed.includes('openspec/.gitignore'), 'the converging path is not a difference')
  assert.deepEqual(changed, ['openspec/changes/widget/proposal.md'])
})

test('a nested OpenSpec root is overlaid by its full path', () => {
  const root = repo()
  mkdirSync(join(root, 'sub', 'openspec', 'changes', 'widget'), { recursive: true })
  writeFileSync(join(root, 'sub', 'openspec', 'changes', 'widget', 'proposal.md'), 'base\n')
  const base = commit(root, 'base')
  writeFileSync(join(root, 'sub', 'openspec', 'changes', 'widget', 'proposal.md'), '# Proposal\n')
  const seal = commit(root, 'seal')
  run(root, ['checkout', '-q', base])
  writeFileSync(join(root, 'main-only.txt'), 'landed\n')
  const fork = commit(root, 'main advance')

  const tree = overlaySealTree({ root, sealCommit: seal, onto: fork })
  assert.ok(tree, 'the overlay tree is built')
  assert.deepEqual(run(root, ['diff', '--name-only', fork, tree]).split('\n').filter(Boolean), [
    'sub/openspec/changes/widget/proposal.md',
  ])
})

test('a path the seal removed is removed from the overlay', () => {
  const root = repo()
  mkdirSync(join(root, 'openspec', 'changes', 'widget'), { recursive: true })
  writeFileSync(join(root, 'openspec', 'changes', 'widget', 'old.md'), 'old\n')
  const base = commit(root, 'base')
  rmSync(join(root, 'openspec', 'changes', 'widget', 'old.md'))
  writeFileSync(join(root, 'openspec', 'changes', 'widget', 'proposal.md'), '# Proposal\n')
  const seal = commit(root, 'seal')
  run(root, ['checkout', '-q', base])
  writeFileSync(join(root, 'main-only.txt'), 'landed\n')
  const fork = commit(root, 'main advance')

  const tree = overlaySealTree({ root, sealCommit: seal, onto: fork })
  assert.ok(tree, 'the overlay tree is built')
  const paths = treePaths(root, tree)
  assert.ok(!paths.includes('openspec/changes/widget/old.md'), 'the removed path is absent')
  assert.ok(paths.includes('openspec/changes/widget/proposal.md'), 'the added path is present')
  assert.deepEqual(run(root, ['diff', '--name-only', fork, tree]).split('\n').filter(Boolean).sort(), [
    'openspec/changes/widget/old.md',
    'openspec/changes/widget/proposal.md',
  ])
})

test('an unresolvable input returns no tree', () => {
  const root = repo()
  writeFileSync(join(root, 'a.txt'), 'a\n')
  const base = commit(root, 'base')
  assert.equal(overlaySealTree({ root, sealCommit: 'f'.repeat(40), onto: base }), undefined)
  assert.equal(overlaySealTree({ root, sealCommit: base, onto: 'f'.repeat(40) }), undefined)
})

/** Build a sealed draft branch and a main advance, optionally rebasing the branch onto it. */
function reviewRepo(options = {}) {
  const root = repo()
  mkdirSync(join(root, 'openspec'), { recursive: true })
  writeFileSync(join(root, 'openspec', '.gitignore'), '.review/\n')
  const base = commit(root, 'base')
  run(root, ['checkout', '-q', '-b', 'feature', base])
  mkdirSync(join(root, 'openspec', 'changes', 'widget'), { recursive: true })
  writeFileSync(join(root, 'openspec', 'changes', 'widget', 'proposal.md'), '# Proposal\n')
  const seal = commit(root, 'seal')
  run(root, ['checkout', '-q', '-B', 'mainline', base])
  writeFileSync(join(root, 'main-only.txt'), 'landed\n')
  const fork = commit(root, 'main advance')
  run(root, ['update-ref', 'refs/remotes/origin/main', fork])
  run(root, ['checkout', '-q', 'feature'])
  if (options.rebase !== false) run(root, ['rebase', '-q', 'mainline'])
  return { root, base, seal, fork }
}

test('a draft base behind the fork re-bases onto the fork with the seal paths', () => {
  const { root, seal, fork } = reviewRepo()
  const resolved = resolveApplyBase({
    root, baseline: 'draft', draftBaseCommit: seal, recordedBaseCommit: undefined, recordedBaseSource: undefined,
  })
  assert.equal(resolved.baseSource, 'rebase')
  assert.equal(resolved.baseCommit, fork)
  assert.equal(resolved.rebasedFrom, seal)
  assert.deepEqual(run(root, ['diff', '--name-only', fork, resolved.baseTreeSha]).split('\n').filter(Boolean).sort(), [
    'openspec/changes/widget/proposal.md',
  ])
})

test('a draft base whose seal parent is the fork keeps the seal', () => {
  const { root, seal } = reviewRepo({ rebase: false })
  const resolved = resolveApplyBase({ root, baseline: 'draft', draftBaseCommit: seal })
  assert.equal(resolved.baseSource, 'seal')
  assert.equal(resolved.baseCommit, seal)
  assert.equal(resolved.rebasedFrom, undefined)
})

test('an unresolved origin/main keeps the recorded base', () => {
  const { root, seal } = reviewRepo()
  run(root, ['update-ref', '-d', 'refs/remotes/origin/main'])
  const resolved = resolveApplyBase({ root, baseline: 'draft', draftBaseCommit: seal })
  assert.equal(resolved.baseSource, 'seal')
  assert.equal(resolved.baseCommit, seal)
})

test('an automatic no-draft base behind the fork re-bases to the fork tree', () => {
  const { root, base, fork } = reviewRepo()
  const resolved = resolveApplyBase({ root, baseline: 'none', recordedBaseCommit: base, recordedBaseSource: 'merge-base' })
  assert.equal(resolved.baseSource, 'merge-base')
  assert.equal(resolved.baseCommit, fork)
  assert.equal(resolved.baseTreeSha, run(root, ['rev-parse', `${fork}^{tree}`]))
  assert.equal(resolved.rebasedFrom, base)
})

test('an explicit recorded no-draft base stays authoritative', () => {
  const { root, base } = reviewRepo()
  const resolved = resolveApplyBase({ root, baseline: 'none', recordedBaseCommit: base, recordedBaseSource: 'explicit' })
  assert.equal(resolved.baseSource, 'explicit')
  assert.equal(resolved.baseCommit, base)
  assert.equal(resolved.rebasedFrom, undefined)
})

test('a no-draft base that is not an ancestor stays authoritative', () => {
  const { root, seal } = reviewRepo()
  const resolved = resolveApplyBase({ root, baseline: 'none', recordedBaseCommit: seal, recordedBaseSource: 'merge-base' })
  assert.equal(resolved.baseSource, 'merge-base')
  assert.equal(resolved.baseCommit, seal)
})

test('an explicit base wins over any re-base', () => {
  const { root, fork } = reviewRepo()
  const resolved = resolveApplyBase({
    root, baseline: 'draft', draftBaseCommit: 'f'.repeat(40), explicitBase: fork,
  })
  assert.equal(resolved.baseSource, 'explicit')
  assert.equal(resolved.baseCommit, fork)
})

test('a missing fork and a missing recorded base refuse', () => {
  const root = repo()
  writeFileSync(join(root, 'a.txt'), 'a\n')
  commit(root, 'base')
  assert.throws(
    () => resolveApplyBase({ root, baseline: 'draft' }),
    /could not determine a base commit/,
  )
  assert.throws(
    () => resolveApplyBase({ root, baseline: 'draft', explicitBase: 'f'.repeat(40) }),
    /could not resolve base/,
  )
})

test('an unresolvable recorded base refuses', () => {
  const { root } = reviewRepo()
  assert.throws(
    () => resolveApplyBase({ root, baseline: 'none', recordedBaseCommit: 'f'.repeat(40) }),
    /could not resolve base/,
  )
})

/** Run fn while a git wrapper executes `rules` before delegating to the real git. */
function withGitStub(rules, fn, env = {}) {
  const bin = mkdtempSync(join(tmpdir(), 'openspec-flow-git-'))
  const real = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim()
  writeFileSync(join(bin, 'git'), `#!/bin/sh\n${rules.replaceAll('__REAL__', real)}\nexec ${real} "$@"\n`)
  spawnSync('chmod', ['+x', join(bin, 'git')])
  const before = process.env.PATH
  const previous = {}
  for (const key of Object.keys(env)) {
    previous[key] = process.env[key]
    process.env[key] = env[key]
  }
  process.env.PATH = `${bin}:${before}`
  try {
    return fn()
  } finally {
    process.env.PATH = before
    for (const key of Object.keys(env)) {
      if (previous[key] === undefined) delete process.env[key]
      else process.env[key] = previous[key]
    }
    rmSync(bin, { recursive: true, force: true })
  }
}

test('a draft baseline without a recorded seal keeps the recorded base', () => {
  const { root, seal } = reviewRepo()
  const resolved = resolveApplyBase({ root, baseline: 'draft', recordedBaseCommit: seal, recordedBaseSource: 'merge-base' })
  assert.equal(resolved.baseSource, 'merge-base')
  assert.equal(resolved.baseCommit, seal)
})

test('an unreadable seal listing returns no tree', { skip: process.platform === 'win32' }, () => {
  const { root, seal, fork } = reviewRepo()
  const tree = withGitStub(
    'for a in "$@"; do if [ "$a" = "ls-tree" ]; then exit 1; fi; done',
    () => overlaySealTree({ root, sealCommit: seal, onto: fork }),
  )
  assert.equal(tree, undefined)
})

test('a malformed seal listing returns no tree', { skip: process.platform === 'win32' }, () => {
  const { root, seal, fork } = reviewRepo()
  const noTab = withGitStub(
    "for a in \"$@\"; do if [ \"$a\" = \"ls-tree\" ]; then printf 'bad\\0'; exit 0; fi; done",
    () => overlaySealTree({ root, sealCommit: seal, onto: fork }),
  )
  assert.equal(noTab, undefined)
  const noSha = withGitStub(
    "for a in \"$@\"; do if [ \"$a\" = \"ls-tree\" ]; then printf '100644 blob\\tfoo\\0'; exit 0; fi; done",
    () => overlaySealTree({ root, sealCommit: seal, onto: fork }),
  )
  assert.equal(noSha, undefined)
})

test('a seal entry mismatch returns no tree', { skip: process.platform === 'win32' }, () => {
  const { root, seal, fork } = reviewRepo()
  const rules = [
    'for a in "$@"; do',
    '  if [ "$a" = "ls-tree" ]; then',
    '    found=0',
    '    for b in "$@"; do if [ "$b" = "$OPENSPEC_SEAL" ]; then found=1; fi; done',
    '    if [ "$found" = "0" ]; then',
    '      printf \'100644 blob 1111111111111111111111111111111111111111\\t%s\\0\' "openspec/changes/widget/proposal.md"',
    '      exit 0',
    '    fi',
    '  fi',
    'done',
    'exec __REAL__ "$@"',
  ].join('\n')
  const tree = withGitStub(rules, () => overlaySealTree({ root, sealCommit: seal, onto: fork }), { OPENSPEC_SEAL: seal })
  assert.equal(tree, undefined)
})

test('a difference outside the seal paths returns no tree', { skip: process.platform === 'win32' }, () => {
  const { root, seal, fork } = reviewRepo()
  const rules = [
    'for a in "$@"; do',
    '  if [ "$a" = "diff" ]; then printf \'outside.txt\\0\'; exit 0; fi',
    'done',
    'exec __REAL__ "$@"',
  ].join('\n')
  const tree = withGitStub(rules, () => overlaySealTree({ root, sealCommit: seal, onto: fork }))
  assert.equal(tree, undefined)
})

test('a refused overlay refuses the round', { skip: process.platform === 'win32' }, () => {
  const { root, seal } = reviewRepo()
  const rules = [
    'for a in "$@"; do',
    '  if [ "$a" = "diff" ]; then printf \'outside.txt\\0\'; exit 0; fi',
    'done',
    'exec __REAL__ "$@"',
  ].join('\n')
  assert.throws(
    () => withGitStub(rules, () => resolveApplyBase({ root, baseline: 'draft', draftBaseCommit: seal })),
    /could not build the re-based base tree for '.+' at '.+'; pass base=<commit>/,
  )
})
