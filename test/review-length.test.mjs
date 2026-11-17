import assert from 'node:assert/strict'
import test from 'node:test'

import {
  MAX_REQUIREMENT_DESCRIPTION,
  classifyRequirementLength,
  lengthGateMessage,
  renderRequirementLengthSection,
} from '../lib/review/length.js'

const requirement = (name, length) => ({ name, text: 'x'.repeat(length) })
const delta = (spec, operation, requirements, extra = {}) => ({ spec, operation, requirements, ...extra })
const main = (name, length) => new Map([['notes', [requirement(name, length)]]])

test('the boundary is inclusive and ADDED growth is blocking', () => {
  const atLimit = classifyRequirementLength([delta('notes', 'ADDED', [requirement('Stored notes', MAX_REQUIREMENT_DESCRIPTION)])], new Map())
  assert.equal(atLimit.blocking, false)
  assert.deepEqual(atLimit.issues, [])

  const over = classifyRequirementLength([delta('notes', 'ADDED', [requirement('Stored notes', MAX_REQUIREMENT_DESCRIPTION + 1)])], new Map())
  assert.equal(over.blocking, true)
  assert.deepEqual(over.issues[0], {
    kind: 'added-overlong',
    spec: 'notes',
    path: 'specs/notes/spec.md',
    requirement: 'Stored notes',
    operation: 'ADDED',
    length: MAX_REQUIREMENT_DESCRIPTION + 1,
  })
})

test('MODIFIED growth is blocking only when the new text is longer than the baseline', () => {
  const growth = classifyRequirementLength(
    [delta('notes', 'MODIFIED', [requirement('Stored notes', 656)])],
    main('Stored notes', 455),
  )
  assert.equal(growth.blocking, true)
  assert.deepEqual(growth.issues[0], {
    kind: 'modified-growth',
    spec: 'notes',
    path: 'specs/notes/spec.md',
    requirement: 'Stored notes',
    operation: 'MODIFIED',
    length: 656,
    baseline: 455,
  })

  const unchanged = classifyRequirementLength(
    [delta('notes', 'MODIFIED', [requirement('Stored notes', 650)])],
    main('Stored notes', 650),
  )
  assert.equal(unchanged.blocking, false)
  assert.deepEqual(unchanged.issues, [])
  assert.equal(unchanged.legacy.length, 1)
  assert.equal(unchanged.legacy[0].baseline, 650)

  const shortened = classifyRequirementLength(
    [delta('notes', 'MODIFIED', [requirement('Stored notes', 600)])],
    main('Stored notes', 650),
  )
  assert.equal(shortened.blocking, false)
  assert.equal(shortened.legacy.length, 1)
})

test('a renamed MODIFIED requirement follows the baseline rename', () => {
  const result = classifyRequirementLength(
    [
      delta('notes', 'RENAMED', [], { rename: { from: 'Before', to: 'After' } }),
      delta('notes', 'MODIFIED', [requirement('After', 501)]),
    ],
    main('Before', 500),
  )
  assert.equal(result.blocking, true)
  assert.equal(result.issues[0].requirement, 'After')
  assert.equal(result.issues[0].baseline, 500)
})

test('a nested capability keeps its full path', () => {
  const result = classifyRequirementLength(
    [delta('identity/notes', 'ADDED', [requirement('Stored notes', 501)])],
    new Map(),
  )
  assert.equal(result.issues[0].spec, 'identity/notes')
  assert.equal(result.issues[0].path, 'specs/identity/notes/spec.md')
})

test('missing baselines and non-requirement operations are ignored', () => {
  const result = classifyRequirementLength(
    [
      delta('notes', 'MODIFIED', [requirement('Missing', 700)]),
      delta('notes', 'RENAMED', [], { rename: { from: 'A', to: 'B' } }),
    ],
    new Map(),
  )
  assert.equal(result.blocking, false)
  assert.deepEqual(result.issues, [])
  assert.deepEqual(result.legacy, [])
})

test('the brief section carries the measurements and official handling', () => {
  const report = classifyRequirementLength(
    [delta('notes', 'MODIFIED', [requirement('Stored notes', 656)])],
    main('Stored notes', 455),
  )
  const section = renderRequirementLengthSection(report)
  assert.match(section, /## Requirement length/)
  assert.match(section, /specs\/notes\/spec\.md/)
  assert.match(section, /Stored notes/)
  assert.match(section, /656/)
  assert.match(section, /455/)
  assert.match(section, /Do not compress/)
  assert.match(section, /dedicated change/)
  assert.match(section, /Report a blocking length finding/)
  assert.equal(renderRequirementLengthSection({ limit: 500, blocking: false, issues: [], legacy: [] }), '')
})

test('the gate message names the growth and the official handling', () => {
  const report = classifyRequirementLength(
    [delta('notes', 'MODIFIED', [requirement('Stored notes', 656)])],
    main('Stored notes', 455),
  )
  const message = lengthGateMessage(report, 'grow-note', 'apply')
  assert.match(message, /apply refuses change 'grow-note'/)
  assert.match(message, /Stored notes/)
  assert.match(message, /656/)
  assert.match(message, /455/)
  assert.match(message, /Do not compress/)
  assert.equal(lengthGateMessage({ blocking: false, issues: [], legacy: [] }, 'clean'), undefined)
})
