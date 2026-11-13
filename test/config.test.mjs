import assert from 'node:assert/strict'
import test from 'node:test'
import { Config } from '../index.js'

function validate(value) {
  return Config['~standard'].validate(value)
}

test('defaults timeoutMs and accepts an explicit value', () => {
  assert.deepEqual(validate({}), {
    value: {
      timeoutMs: 30_000,
      reviews: {
        draft: { enabled: true, reviewers: 0, maxRounds: 3, waitMinutes: 15 },
        apply: { enabled: true, reviewers: 0, maxRounds: 5, waitMinutes: 15 },
      },
    },
  })
  assert.deepEqual(validate({ timeoutMs: 5_000 }), {
    value: {
      timeoutMs: 5_000,
      reviews: {
        draft: { enabled: true, reviewers: 0, maxRounds: 3, waitMinutes: 15 },
        apply: { enabled: true, reviewers: 0, maxRounds: 5, waitMinutes: 15 },
      },
    },
  })
})

test('accepts a disabled draft review and bounded limits', () => {
  const result = validate({
    reviews: {
        draft: { enabled: false, reviewers: 0, maxRounds: 4, waitMinutes: 20 },
        apply: { enabled: true, reviewers: 0, maxRounds: 5, waitMinutes: 15 },
      },
  })
  assert.deepEqual(result, {
    value: {
      timeoutMs: 30_000,
      reviews: {
        draft: { enabled: false, reviewers: 0, maxRounds: 4, waitMinutes: 20 },
        apply: { enabled: true, reviewers: 0, maxRounds: 5, waitMinutes: 15 },
      },
    },
  })
})

test('rejects an independent reviewer count in this change', () => {
  const result = validate({ reviews: { draft: { reviewers: 1 } } })
  assert.ok(Array.isArray(result.issues))
  assert.match(result.issues[0].message, /reviews\.draft\.reviewers/)
})

test('rejects an unknown review setting', () => {
  const result = validate({ reviews: { other: { enabled: true } } })
  assert.ok(Array.isArray(result.issues))
  assert.match(result.issues[0].message, /reviews\.other is not supported/)
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
