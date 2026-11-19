import assert from 'node:assert/strict'
import test from 'node:test'
import {
  activeChangeNames,
  evaluateChange,
  hasDependencyChange,
  isActiveChangePath,
  isRestrictedPath,
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
