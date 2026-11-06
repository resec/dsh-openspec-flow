import assert from 'node:assert/strict'
import test from 'node:test'
import {
  assertCurrentNode,
  assertPrimaryNode,
  NodeRequirementError,
  parseVersion,
  readNodeRequirements,
  satisfies,
} from '../scripts/node-version.mjs'

const requirements = { primaryMajor: 24, range: '>=24.9.0' }

test('parses a version with or without the v prefix', () => {
  assert.deepEqual(parseVersion('v24.22.2'), { raw: 'v24.22.2', major: 24, minor: 22, patch: 2 })
  assert.deepEqual(parseVersion('24.9.0'), { raw: '24.9.0', major: 24, minor: 9, patch: 0 })
})

test('rejects an unsupported version string', () => {
  assert.throws(() => parseVersion('24'), NodeRequirementError)
  assert.throws(() => parseVersion('v24.22.2-nightly'), NodeRequirementError)
})

test('accepts the primary major and the declared range', () => {
  assert.doesNotThrow(() => assertPrimaryNode('24.22.2', requirements))
  assert.doesNotThrow(() => assertPrimaryNode('24.9.0', requirements))
})

test('rejects a non-primary major', () => {
  assert.throws(
    () => assertPrimaryNode('26.12.0', requirements),
    /requires Node 24\.x; current 26\.12\.0 has major 26/,
  )
})

test('rejects a version below the declared range', () => {
  assert.throws(
    () => assertPrimaryNode('24.8.9', requirements),
    /requires a version satisfying >=24\.9\.0; current 24\.8\.9/,
  )
})

test('supports comparator conjunctions and alternatives', () => {
  assert.equal(satisfies('24.22.2', '>=24.9.0 <25.0.0'), true)
  assert.equal(satisfies('25.0.0', '>=24.9.0 <25.0.0'), false)
  assert.equal(satisfies('24.9.0', '>=24.9.0 || >=26.0.0'), true)
  assert.equal(satisfies('25.0.0', '>=24.9.0 || >=26.0.0'), true)
  assert.equal(satisfies('24.8.0', '>=24.9.0 || >=26.0.0'), false)
  assert.equal(satisfies('24.9.0', '=24.9.0'), true)
})

test('fails closed on unsupported range syntax', () => {
  assert.throws(() => satisfies('24.22.2', '^24.9.0'), /unsupported engines\.node comparator/)
  assert.throws(() => satisfies('24.22.2', '>=24.9'), /unsupported engines\.node comparator/)
})

test('reads the project requirements from the manifest and config', () => {
  assert.deepEqual(readNodeRequirements(), requirements)
})

test('accepts the current runtime when it is the primary Node', () => {
  assert.doesNotThrow(() => assertCurrentNode())
})
