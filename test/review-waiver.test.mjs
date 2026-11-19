import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeWaiverFiles } from '../lib/review/waiver.js'

const CHANGE_ROOT = '/repo/openspec/changes/add-dark-mode'
const CHANGE_PATH = 'openspec/changes/add-dark-mode'
const OPTIONS = { changeRoot: CHANGE_ROOT, changePath: CHANGE_PATH }

test('normalization de-duplicates and sorts paths', () => {
  const result = normalizeWaiverFiles(['tasks.md', 'proposal.md', 'tasks.md'], OPTIONS)
  assert.deepEqual(result.files, ['proposal.md', 'tasks.md'])
  assert.deepEqual(result.refused, [])
  assert.deepEqual(normalizeWaiverFiles([], OPTIONS), { files: [], refused: [] })
})

test('normalization accepts change-relative, project-relative and absolute forms', () => {
  const result = normalizeWaiverFiles([
    'proposal.md',
    'openspec/changes/add-dark-mode/tasks.md',
    `${CHANGE_ROOT}/design.md`,
    'specs/change-review/spec.md',
  ], OPTIONS)
  assert.deepEqual(result.files, [
    'design.md',
    'proposal.md',
    'specs/change-review/spec.md',
    'tasks.md',
  ])
  assert.deepEqual(result.refused, [])
})

test('normalization converts backslash separators and dot segments', () => {
  const result = normalizeWaiverFiles([
    'specs\\change-review\\spec.md',
    './proposal.md',
    'openspec/changes/add-dark-mode/./tasks.md',
  ], OPTIONS)
  assert.deepEqual(result.files, ['proposal.md', 'specs/change-review/spec.md', 'tasks.md'])
})

test('normalization refuses an escaping, foreign or dot entry', () => {
  const result = normalizeWaiverFiles([
    '../outside.md',
    '/etc/passwd',
    'openspec/changes/other/tasks.md',
    'openspec/specs/theme/spec.md',
    '.',
    '',
  ], OPTIONS)
  assert.deepEqual(result.files, [])
  assert.deepEqual(result.refused.map((entry) => entry.input), [
    '../outside.md',
    '/etc/passwd',
    'openspec/changes/other/tasks.md',
    'openspec/specs/theme/spec.md',
    '.',
    '',
  ])
  assert.match(result.refused[0].reason, /outside the change directory/)
  assert.match(result.refused[1].reason, /outside the change directory/)
  assert.match(result.refused[2].reason, /another change/)
  assert.match(result.refused[3].reason, /outside the change directory/)
  assert.match(result.refused[4].reason, /outside the change directory/)
  assert.match(result.refused[5].reason, /empty/)
})

test('normalization refuses the change directory itself', () => {
  const result = normalizeWaiverFiles([CHANGE_PATH], OPTIONS)
  assert.deepEqual(result.files, [])
  assert.equal(result.refused.length, 1)
  assert.match(result.refused[0].reason, /change directory/)
})

test('a store-backed change accepts change-relative and absolute paths', () => {
  const options = { changeRoot: CHANGE_ROOT, changePath: undefined }
  const result = normalizeWaiverFiles(['proposal.md', `${CHANGE_ROOT}/tasks.md`], options)
  assert.deepEqual(result.files, ['proposal.md', 'tasks.md'])
  assert.deepEqual(result.refused, [])
})

test('a store-backed change refuses a project-relative form', () => {
  const options = { changeRoot: CHANGE_ROOT, changePath: undefined }
  const result = normalizeWaiverFiles(['openspec/changes/add-dark-mode/proposal.md'], options)
  assert.deepEqual(result.files, [])
  assert.equal(result.refused.length, 1)
  assert.match(result.refused[0].reason, /change-relative or absolute/)
})

test('normalization refuses a non-string entry', () => {
  const result = normalizeWaiverFiles(['proposal.md', 42, null], OPTIONS)
  assert.deepEqual(result.files, ['proposal.md'])
  assert.equal(result.refused.length, 2)
  assert.match(result.refused[0].reason, /not a string/)
  assert.match(result.refused[1].reason, /not a string/)
})

test('normalization strips a leading dot slash before the prefix tests', () => {
  const result = normalizeWaiverFiles([
    './openspec/changes/add-dark-mode/tasks.md',
    './openspec/changes/other/tasks.md',
    './openspec/specs/theme/spec.md',
  ], OPTIONS)
  assert.deepEqual(result.files, ['tasks.md'])
  assert.equal(result.refused.length, 2)
  assert.match(result.refused[0].reason, /another change/)
  assert.match(result.refused[1].reason, /outside the change directory/)
})

test('a store-backed change refuses a dot-slash project-relative form', () => {
  const result = normalizeWaiverFiles(['./openspec/changes/add-dark-mode/proposal.md'], {
    changeRoot: CHANGE_ROOT,
    changePath: undefined,
  })
  assert.deepEqual(result.files, [])
  assert.equal(result.refused.length, 1)
  assert.match(result.refused[0].reason, /change-relative or absolute/)
})
