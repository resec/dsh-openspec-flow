import assert from 'node:assert/strict'
import test from 'node:test'

import {
  classifyExecutionPreflight,
  executionGateMessage,
  renderExecutionPreflightSection,
} from '../lib/review/preflight.js'

const requirement = (name) => ({ name, text: 'x' })
const delta = (spec, operation, requirements, extra = {}) => ({ spec, operation, requirements, ...extra })
const main = (spec, names) => new Map([[spec, names.map(requirement)]])
const tasks = (...lines) => lines.join('\n')
const exists = (...paths) => (path) => paths.includes(path)

test('a matching MODIFIED or REMOVED name passes the anchor check', () => {
  const report = classifyExecutionPreflight({
    deltas: [
      delta('notes', 'MODIFIED', [requirement('Stored notes')]),
      delta('notes', 'REMOVED', [requirement('Old notes')]),
    ],
    mainSpecs: main('notes', ['Stored notes', 'Old notes']),
  })
  assert.equal(report.blocking, false)
  assert.deepEqual(report.issues, [])
})

test('a missing MODIFIED name blocks with its path and operation', () => {
  const report = classifyExecutionPreflight({
    deltas: [delta('notes', 'MODIFIED', [requirement('Missing notes')])],
    mainSpecs: main('notes', ['Stored notes']),
  })
  assert.equal(report.blocking, true)
  assert.deepEqual(report.issues, [{
    kind: 'anchor',
    reason: 'missing-requirement',
    spec: 'notes',
    path: 'specs/notes/spec.md',
    operation: 'MODIFIED',
    requirement: 'Missing notes',
  }])
})

test('a missing REMOVED name blocks', () => {
  const report = classifyExecutionPreflight({
    deltas: [delta('notes', 'REMOVED', [requirement('Missing notes')])],
    mainSpecs: main('notes', ['Stored notes']),
  })
  assert.equal(report.blocking, true)
  assert.equal(report.issues[0].reason, 'missing-requirement')
  assert.equal(report.issues[0].operation, 'REMOVED')
})

test('a rename target resolves through its source', () => {
  const report = classifyExecutionPreflight({
    deltas: [
      delta('notes', 'RENAMED', [], { rename: { from: 'Old notes', to: 'New notes' } }),
      delta('notes', 'MODIFIED', [requirement('New notes')]),
    ],
    mainSpecs: main('notes', ['Old notes']),
  })
  assert.equal(report.blocking, false)
  assert.deepEqual(report.issues, [])
})

test('a chained rename resolves to the original baseline', () => {
  const report = classifyExecutionPreflight({
    deltas: [
      delta('notes', 'RENAMED', [], { rename: { from: 'Old notes', to: 'Mid notes' } }),
      delta('notes', 'RENAMED', [], { rename: { from: 'Mid notes', to: 'New notes' } }),
      delta('notes', 'MODIFIED', [requirement('New notes')]),
    ],
    mainSpecs: main('notes', ['Old notes']),
  })
  assert.equal(report.blocking, false)
  assert.deepEqual(report.issues, [])
})

test('a missing RENAMED source blocks', () => {
  const report = classifyExecutionPreflight({
    deltas: [delta('notes', 'RENAMED', [], { rename: { from: 'Missing notes', to: 'New notes' } })],
    mainSpecs: main('notes', ['Old notes']),
  })
  assert.equal(report.blocking, true)
  assert.deepEqual(report.issues[0], {
    kind: 'anchor',
    reason: 'missing-rename-source',
    spec: 'notes',
    path: 'specs/notes/spec.md',
    operation: 'RENAMED',
    requirement: 'Missing notes',
  })
})

test('a missing main spec blocks every anchoring name', () => {
  const report = classifyExecutionPreflight({
    deltas: [
      delta('notes', 'MODIFIED', [requirement('Stored notes')]),
      delta('notes', 'RENAMED', [], { rename: { from: 'Old notes', to: 'New notes' } }),
    ],
    mainSpecs: new Map(),
  })
  assert.equal(report.blocking, true)
  assert.deepEqual(report.issues.map((issue) => issue.reason), ['missing-main-spec', 'missing-main-spec'])
  assert.deepEqual(report.issues.map((issue) => issue.requirement), ['Stored notes', 'Old notes'])
})

test('an existing test path passes', () => {
  const report = classifyExecutionPreflight({
    tasksText: tasks('- [ ] 1.1 Verify `test/review-length.test.mjs` passes.'),
    pathExists: exists('test/review-length.test.mjs'),
  })
  assert.equal(report.blocking, false)
  assert.deepEqual(report.issues, [])
})

test('a missing undeclared path blocks with its task and line', () => {
  const report = classifyExecutionPreflight({
    tasksText: tasks('- [ ] 1.2 Verify `test/missing.test.mjs` passes.'),
    pathExists: () => false,
  })
  assert.equal(report.blocking, true)
  assert.deepEqual(report.issues, [{
    kind: 'path',
    reason: 'missing-path',
    path: 'test/missing.test.mjs',
    line: 1,
    task: '1.2',
  }])
})

test('a declared creation, deletion, rename or move passes', () => {
  const text = tasks(
    '- [ ] 1.3 Add `test/new.test.mjs` and verify it passes.',
    '- [ ] 1.4 Delete `test/legacy.test.mjs`.',
    '- [ ] 1.5 Rename `test/old.test.mjs` to `test/moved.test.mjs`.',
    '- [ ] 1.6 Generate `scripts/check.sh`.',
  )
  const report = classifyExecutionPreflight({ tasksText: text, pathExists: () => false })
  assert.equal(report.blocking, false)
  assert.deepEqual(report.issues, [])
})

test('globs, placeholders, absolute paths and dot segments are skipped', () => {
  const text = tasks(
    '- [ ] 1.7 Verify `test/review-*.test.mjs` passes.',
    '- [ ] 1.8 Verify `test/<name>.test.mjs` passes.',
    '- [ ] 1.9 Verify `/tmp/absolute.test.mjs` passes.',
    '- [ ] 1.10 Verify `test/../escape.test.mjs` passes.',
    '- [ ] 1.11 Verify `lib/review/preflight.js` exists.',
  )
  const report = classifyExecutionPreflight({ tasksText: text, pathExists: () => false })
  assert.equal(report.blocking, false)
  assert.deepEqual(report.issues, [])
})

test('an ASCII period splits clauses so a creation verb does not leak', () => {
  const text = tasks('- [ ] 1.12 Add `test/new.test.mjs`. Verify `test/missing.test.mjs` passes.')
  const report = classifyExecutionPreflight({ tasksText: text, pathExists: () => false })
  assert.equal(report.blocking, true)
  assert.deepEqual(report.issues.map((issue) => issue.path), ['test/missing.test.mjs'])
})

test('verbs match on word boundaries', () => {
  const text = tasks('- [ ] 1.13 Renew `test/missing.test.mjs`.')
  const report = classifyExecutionPreflight({ tasksText: text, pathExists: () => false })
  assert.equal(report.blocking, true)
  assert.equal(report.issues[0].path, 'test/missing.test.mjs')
})

test('a path declared on another line is allowed', () => {
  const text = tasks(
    '- [ ] 1.14 Add `test/new.test.mjs`.',
    '- [ ] 1.15 Verify `test/new.test.mjs` passes.',
  )
  const report = classifyExecutionPreflight({ tasksText: text, pathExists: () => false })
  assert.equal(report.blocking, false)
  assert.deepEqual(report.issues, [])
})

test('the brief section is empty without issues and names both routes with issues', () => {
  assert.equal(renderExecutionPreflightSection(undefined), '')
  assert.equal(renderExecutionPreflightSection({ blocking: false, issues: [] }), '')

  const report = classifyExecutionPreflight({
    deltas: [delta('notes', 'MODIFIED', [requirement('Missing notes')])],
    mainSpecs: main('notes', ['Stored notes']),
  })
  const section = renderExecutionPreflightSection(report)
  assert.match(section, /## Execution preflight/)
  assert.match(section, /specs\/notes\/spec\.md: MODIFIED "Missing notes" has no main-spec baseline/)
  assert.match(section, /openspec_review action=resume review=draft/)
  assert.match(section, /If another unarchived change supplies a missing requirement, wait for that change to archive/)
})

test('the gate message is absent for a passing report and names the wait route for a block', () => {
  assert.equal(executionGateMessage({ blocking: false, issues: [] }, 'notes'), undefined)

  const report = classifyExecutionPreflight({
    tasksText: tasks('- [ ] 2.1 Verify `test/missing.test.mjs` passes.'),
    pathExists: () => false,
  })
  const message = executionGateMessage(report, 'notes', 'apply')
  assert.match(message, /apply refuses change 'notes' because the draft execution preflight failed:/)
  assert.match(message, /test\/missing\.test\.mjs/)
  assert.match(message, /wait for that change to archive/)
})

test('the default path checker and every anchor reason render', () => {
  const defaulted = classifyExecutionPreflight({
    tasksText: tasks('- [ ] 1.1 Verify `test/missing.test.mjs` passes.'),
  })
  assert.equal(defaulted.blocking, true)
  assert.equal(defaulted.issues[0].path, 'test/missing.test.mjs')

  const missingMain = classifyExecutionPreflight({
    deltas: [delta('notes', 'MODIFIED', [requirement('Stored notes')])],
    mainSpecs: new Map(),
  })
  assert.match(executionGateMessage(missingMain, 'notes'), /anchors to a missing main spec/)

  const missingRename = classifyExecutionPreflight({
    deltas: [delta('notes', 'RENAMED', [], { rename: { from: 'Missing notes', to: 'New notes' } })],
    mainSpecs: main('notes', ['Old notes']),
  })
  assert.match(executionGateMessage(missingRename, 'notes'), /RENAMED FROM "Missing notes" has no main-spec baseline/)
})

test('malformed input is ignored', () => {
  const report = classifyExecutionPreflight()
  assert.equal(report.blocking, false)
  assert.deepEqual(report.issues, [])

  const malformed = classifyExecutionPreflight({
    deltas: [null, { spec: 'notes', operation: 'ADDED' }],
    mainSpecs: new Map(),
    tasksText: '',
    pathExists: () => false,
  })
  assert.equal(malformed.blocking, false)
})
