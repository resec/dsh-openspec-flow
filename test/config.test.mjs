import assert from 'node:assert/strict'
import test from 'node:test'
import { Config } from '../index.js'
import { resolveEntry } from '../lib/review/entry.js'
import { readReviewConfig } from '../lib/review/file.js'

function validate(value) {
  return Config['~standard'].validate(value)
}

test('defaults timeoutMs and the review switch', () => {
  assert.deepEqual(validate({}), {
    value: {
      timeoutMs: 30_000,
      reviewEnabled: true,
      legacyReviews: false,
      worktree: { enabled: true },
    },
  })
  assert.deepEqual(validate({ timeoutMs: 5_000 }), {
    value: {
      timeoutMs: 5_000,
      reviewEnabled: true,
      legacyReviews: false,
      worktree: { enabled: true },
    },
  })
})

test('accepts the review switch and rejects a non-boolean', () => {
  assert.equal(validate({ reviewEnabled: false }).value.reviewEnabled, false)
  assert.equal(validate({ reviewEnabled: true }).value.reviewEnabled, true)
  assert.match(validate({ reviewEnabled: 'yes' }).issues[0].message, /reviewEnabled must be a boolean/)
})

test('accepts a legacy reviews section and reports it', () => {
  const result = validate({
    reviews: {
      draft: { enabled: false, reviewers: 1, waitMinutes: 20 },
      apply: { enabled: true },
    },
  })
  assert.equal(result.value.legacyReviews, true)
  assert.equal(result.value.reviewEnabled, true)
  assert.equal('reviews' in result.value, false, 'the row config never carries review parameters')
})

test('a row config without reviews reports no legacy section', () => {
  assert.equal(validate({}).value.legacyReviews, false)
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

test('the repository review configuration declares a pr tree entry', () => {
  const result = readReviewConfig(import.meta.dirname.replace(/\/test$/u, ''))
  assert.equal(result.ok, true)
  assert.equal(result.value.reviews.pr, 'pr-tree')
  const entry = resolveEntry(result.value, 'pr')
  assert.equal(entry.object, 'tree')
  assert.equal(entry.section.enabled, true)
  assert.equal(entry.section.reviewers, 1)
  assert.equal(entry.section.waitMinutes, 15)
  assert.deepEqual(entry.section.reviewerModel, { source: 'inherit' })
  assert.deepEqual(result.value.pipeline, { beforeApply: 'draft', beforeArchive: 'apply' })
  for (const profile of ['standard-directory', 'standard-tree']) {
    assert.equal(result.value.profiles[profile].passCriteria, 'major')
    assert.equal(result.value.profiles[profile].allowDeferred, true)
    assert.equal(result.value.profiles[profile].allowRejected, true)
  }
  assert.equal(entry.section.passCriteria, 'nit')
  assert.equal(entry.section.allowDeferred, false)
  assert.equal(entry.section.allowRejected, false)
})
