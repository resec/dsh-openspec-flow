import assert from 'node:assert/strict'
import test from 'node:test'
import { Config } from '../index.js'

function validate(value) {
  return Config['~standard'].validate(value)
}

test('defaults timeoutMs and accepts an explicit value', () => {
  assert.deepEqual(validate({}), { value: { timeoutMs: 30_000 } })
  assert.deepEqual(validate({ timeoutMs: 5_000 }), { value: { timeoutMs: 5_000 } })
})

test('rejects the removed cliPath setting', () => {
  const result = validate({ cliPath: '/tmp/openspec' })
  assert.ok(Array.isArray(result.issues))
  assert.match(result.issues[0].message, /cliPath is no longer supported/)
})

test('rejects an invalid timeout', () => {
  const result = validate({ timeoutMs: 1 })
  assert.ok(Array.isArray(result.issues))
  assert.match(result.issues[0].message, /timeoutMs must be an integer/)
})
