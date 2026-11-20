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
        draft: {
          enabled: true, reviewers: 0, waitMinutes: 15, reviewerModel: { source: 'inherit' },
        },
        apply: {
          enabled: true, reviewers: 0, waitMinutes: 15, reviewerModel: { source: 'inherit' },
        },
      },
      worktree: { enabled: true },
    },
  })
  assert.deepEqual(validate({ timeoutMs: 5_000 }), {
    value: {
      timeoutMs: 5_000,
      reviews: {
        draft: {
          enabled: true, reviewers: 0, waitMinutes: 15, reviewerModel: { source: 'inherit' },
        },
        apply: {
          enabled: true, reviewers: 0, waitMinutes: 15, reviewerModel: { source: 'inherit' },
        },
      },
      worktree: { enabled: true },
    },
  })
})

test('accepts a disabled draft review and bounded limits', () => {
  const result = validate({
    reviews: {
        draft: {
          enabled: false, reviewers: 0, waitMinutes: 20, reviewerModel: { source: 'inherit' },
        },
        apply: {
          enabled: true, reviewers: 0, waitMinutes: 15, reviewerModel: { source: 'inherit' },
        },
      },
  })
  assert.deepEqual(result, {
    value: {
      timeoutMs: 30_000,
      reviews: {
        draft: {
          enabled: false, reviewers: 0, waitMinutes: 20, reviewerModel: { source: 'inherit' },
        },
        apply: {
          enabled: true, reviewers: 0, waitMinutes: 15, reviewerModel: { source: 'inherit' },
        },
      },
      worktree: { enabled: true },
    },
  })
})

test('accepts an explicit reviewer model and rejects a malformed one', () => {
  const explicit = validate({
    reviews: {
      draft: {
        reviewerModel: { source: 'explicit', provider: 'deepseek', model: 'deepseek-flash', reasoningEffort: 'max' },
      },
    },
  })
  assert.deepEqual(explicit.value.reviews.draft.reviewerModel, {
    source: 'explicit', provider: 'deepseek', model: 'deepseek-flash', reasoningEffort: 'max',
  })

  const noRoute = validate({ reviews: { draft: { reviewerModel: { source: 'explicit' } } } })
  assert.match(noRoute.issues[0].message, /reviews\.draft\.reviewerModel\.provider/)
  assert.match(noRoute.issues[1].message, /reviews\.draft\.reviewerModel\.model/)

  const badSource = validate({ reviews: { apply: { reviewerModel: { source: 'other' } } } })
  assert.match(badSource.issues[0].message, /reviewerModel\.source must be "inherit" or "explicit"/)

  const inheritedRoute = validate({
    reviews: { apply: { reviewerModel: { source: 'inherit', provider: 'deepseek' } } },
  })
  assert.match(inheritedRoute.issues[0].message, /not allowed when source is "inherit"/)

  const unknownKey = validate({ reviews: { draft: { reviewerModel: { source: 'inherit', extra: 1 } } } })
  assert.match(unknownKey.issues[0].message, /reviewerModel\.extra is not supported/)

  const notObject = validate({ reviews: { draft: { reviewerModel: 'deepseek' } } })
  assert.match(notObject.issues[0].message, /reviewerModel must be an object/)

  const emptyEffort = validate({
    reviews: { draft: { reviewerModel: { source: 'explicit', provider: 'deepseek', model: 'm', reasoningEffort: '  ' } } },
  })
  assert.match(emptyEffort.issues[0].message, /reasoningEffort must be a non-empty string/)
})

test('rejects an independent reviewer count in this change', () => {
  const result = validate({ reviews: { draft: { reviewers: 2 } } })
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


test('accepts the worktree switch and rejects a non-boolean', () => {
  assert.equal(validate({ worktree: { enabled: false } }).value.worktree.enabled, false)
  assert.equal(validate({}).value.worktree.enabled, true)
  assert.match(validate({ worktree: { enabled: 'yes' } }).issues[0].message, /worktree\.enabled/)
})
