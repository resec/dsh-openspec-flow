import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import {
  activeChangeNames,
  changedPaths,
  evaluateChange,
  hasDependencyChange,
  isActiveChangePath,
  isRestrictedPath,
  parseHead,
  uncheckedTasks,
} from '../scripts/check-pr-change.mjs'

test('recognizes active change paths and excludes the archive', () => {
  assert.equal(isActiveChangePath('openspec/changes/add-thing/proposal.md'), true)
  assert.equal(isActiveChangePath('openspec/changes/archive/old-change/proposal.md'), false)
  assert.equal(isActiveChangePath('openspec/specs/tool-surface/spec.md'), false)
  assert.deepEqual(
    [...activeChangeNames([
      'openspec/changes/add-thing/proposal.md',
      'openspec/changes/add-thing/tasks.md',
      'openspec/changes/archive/old/proposal.md',
    ])],
    ['add-thing'],
  )
})

test('finds unchecked tasks and ignores checked ones', () => {
  const markdown = [
    '## 1. Work',
    '- [ ] 1.1 Do the first thing',
    '- [x] 1.2 Do the second thing',
    '* [ ] 1.3 Do the third thing',
    '- [~] 1.4 Defer the fourth thing',
    '- [-] 1.5 Cancel the fifth thing',
    '- [] 1.6 Leave the sixth thing empty',
  ].join('\n')
  assert.deepEqual(uncheckedTasks(markdown).map((task) => task.id), ['1.1', '1.3', '1.4', '1.5', '1.6'])
  assert.deepEqual(uncheckedTasks('- [X] 1.1 Done'), [])
})

test('rejects the restricted paths', () => {
  for (const path of [
    '.githooks/pre-push',
    '.github/workflows/ci.yml',
    'coverage.baseline.json',
    'dist/plugin.tgz',
    'openspec/changes/archive/old/proposal.md',
    'package-lock.json',
  ]) {
    assert.equal(isRestrictedPath(path), true, path)
  }
  assert.equal(isRestrictedPath('lib/tools/review.js'), false)
  assert.equal(isRestrictedPath('package.json'), false)
})

test('evaluateChange requires exactly one active change and keeps other diagnostics', () => {
  const one = evaluateChange({
    paths: ['openspec/changes/a/proposal.md'],
    tasksByChange: { a: '- [x] 1.1 Done' },
  })
  assert.deepEqual(one, [])

  const zero = evaluateChange({ paths: ['lib/plugin.js'] })
  assert.match(zero.join('\n'), /must add or update an active change/)

  const two = evaluateChange({
    paths: ['openspec/changes/a/proposal.md', 'openspec/changes/b/proposal.md'],
  })
  assert.match(two.join('\n'), /exactly one active change; found: a, b/)

  const restricted = evaluateChange({
    paths: [
      'openspec/changes/a/proposal.md',
      'openspec/changes/b/proposal.md',
      '.github/workflows/ci.yml',
    ],
  })
  assert.match(restricted.join('\n'), /exactly one active change; found: a, b/)
  assert.match(restricted.join('\n'), /restricted path changed: \.github\/workflows\/ci\.yml/)

  const unchecked = evaluateChange({
    paths: ['openspec/changes/a/proposal.md'],
    tasksByChange: { a: '- [ ] 1.1 Todo' },
  })
  assert.match(unchecked.join('\n'), /unchecked tasks: 1\.1/)
})

test('detects a dependency change but allows a scripts-only edit', () => {
  const base = { scripts: { test: 'node test.mjs' }, devDependencies: { playwright: '^1.0.0' } }
  assert.equal(hasDependencyChange(base, { ...base, scripts: { test: 'node other.mjs' } }), false)
  assert.equal(
    hasDependencyChange(base, { ...base, devDependencies: { playwright: '^2.0.0' } }),
    true,
  )
  assert.equal(
    hasDependencyChange(base, { ...base, engines: { node: '>=26.0.0' } }),
    true,
  )
})

const CHECK_SCRIPT = fileURLToPath(new URL('../scripts/check-pr-change.mjs', import.meta.url))

function gitRun(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

function writeFileAt(root, path, text) {
  mkdirSync(dirname(join(root, path)), { recursive: true })
  writeFileSync(join(root, path), text)
}

/**
 * Build a repository whose HEAD is a merge of an advanced main and a pull-request branch.
 * @param options - `{ prFiles, mainFiles, prDelete }` texts and paths.
 * @returns `{ root, base, head }`, with the script copied under the fixture.
 */
function makeMergeCheckout({ prFiles = {}, mainFiles = {}, prDelete = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-pr-change-'))
  gitRun(root, ['init', '-q', '-b', 'main'])
  gitRun(root, ['config', 'user.email', 'test@example.test'])
  gitRun(root, ['config', 'user.name', 'Test'])
  writeFileAt(root, 'package.json', '{"name":"widget","version":"1.0.0"}\n')
  writeFileAt(root, 'openspec/changes/widget/proposal.md', '# Widget\n')
  writeFileAt(root, 'openspec/changes/widget/tasks.md', '# Tasks\n\n- [x] 1.1 Done\n')
  gitRun(root, ['add', '-A'])
  gitRun(root, ['commit', '-qm', 'base'])
  const base = gitRun(root, ['rev-parse', 'HEAD'])
  gitRun(root, ['checkout', '-q', '-b', 'pr'])
  writeFileAt(root, 'openspec/changes/widget/proposal.md', '# Widget\n\n## Why\n\nA thing.\n')
  for (const [path, text] of Object.entries(prFiles)) writeFileAt(root, path, text)
  for (const path of prDelete) rmSync(join(root, path))
  gitRun(root, ['add', '-A'])
  gitRun(root, ['commit', '-qm', 'pull request'])
  const head = gitRun(root, ['rev-parse', 'HEAD'])
  gitRun(root, ['checkout', '-q', 'main'])
  writeFileAt(root, '.github/workflows/ci.yml', 'name: ci\n')
  for (const [path, text] of Object.entries(mainFiles)) writeFileAt(root, path, text)
  gitRun(root, ['add', '-A'])
  gitRun(root, ['commit', '-qm', 'main advance'])
  gitRun(root, ['merge', '--no-ff', '--no-edit', '-q', 'pr'])
  mkdirSync(join(root, 'scripts'), { recursive: true })
  copyFileSync(CHECK_SCRIPT, join(root, 'scripts', 'check-pr-change.mjs'))
  return { root, base, head }
}

function spawnCheck(root, args) {
  return spawnSync(process.execPath, [join(root, 'scripts', 'check-pr-change.mjs'), ...args], { cwd: root, encoding: 'utf8' })
}

test('the merge checkout counts advanced main commits without --head', () => {
  const { root, base } = makeMergeCheckout()
  try {
    assert.equal(changedPaths(base, 'HEAD', root).includes('.github/workflows/ci.yml'), true)
    const result = spawnCheck(root, ['--base', base])
    assert.equal(result.status, 1, result.stderr)
    assert.match(result.stderr, /restricted path changed: \.github\/workflows\/ci\.yml/u)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the pull-request head excludes advanced main commits', () => {
  const { root, base, head } = makeMergeCheckout()
  try {
    assert.deepEqual(changedPaths(base, head, root), ['openspec/changes/widget/proposal.md'])
    const result = spawnCheck(root, ['--base', base, '--head', head])
    assert.equal(result.status, 0, result.stderr)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a pull request that changes a restricted path still fails', () => {
  const { root, base, head } = makeMergeCheckout({ prFiles: { 'coverage.baseline.json': '{}\n' } })
  try {
    const result = spawnCheck(root, ['--base', base, '--head', head])
    assert.equal(result.status, 1, result.stderr)
    assert.match(result.stderr, /restricted path changed: coverage\.baseline\.json/u)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a head without package.json fails the step', () => {
  const { root, base, head } = makeMergeCheckout({ prDelete: ['package.json'] })
  try {
    const result = spawnCheck(root, ['--base', base, '--head', head])
    assert.equal(result.status, 1, result.stderr)
    assert.match(result.stderr, /package\.json/u)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a value-less --head exits 2 and an unknown head exits 1', () => {
  const { root, base } = makeMergeCheckout()
  try {
    const missing = spawnCheck(root, ['--base', base, '--head'])
    assert.equal(missing.status, 2, missing.stderr)
    assert.match(missing.stderr, /usage:/u)
    const unknown = spawnCheck(root, ['--base', base, '--head', 'nosuchrev'])
    assert.equal(unknown.status, 1, unknown.stderr)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the head package.json excludes a dependency change from the advanced base', () => {
  const { root, base, head } = makeMergeCheckout({
    mainFiles: { 'package.json': '{"name":"widget","version":"1.0.0","dependencies":{"left-pad":"1.0.0"}}\n' },
  })
  try {
    const result = spawnCheck(root, ['--base', base, '--head', head])
    assert.equal(result.status, 0, result.stderr)
    assert.doesNotMatch(result.stderr, /dependency/u)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
