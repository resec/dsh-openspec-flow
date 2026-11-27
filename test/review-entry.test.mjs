import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_REVIEW_CONFIG, normalizeReviewDocument } from '../lib/review/config.js'
import { DEFAULT_ENTRY, entryNames, gateEntry, pipelineOf, resolveEntry } from '../lib/review/entry.js'
import { reviewFile, roundPrefix } from '../lib/review/record.js'

function parsedDocument() {
  const raw = structuredClone(DEFAULT_REVIEW_CONFIG)
  raw.profiles['pr-tree'] = { ...structuredClone(raw.profiles['standard-tree']), reviewers: 1 }
  raw.reviews.pr = 'pr-tree'
  raw.pipeline = { beforeApply: 'draft', beforeArchive: 'pr' }
  const result = normalizeReviewDocument(raw)
  assert.deepEqual(result.issues, [])
  return result.value
}

test('a parsed document resolves a pr entry from its profile object', () => {
  const config = parsedDocument()
  const entry = resolveEntry(config, 'pr')
  assert.equal(entry.name, 'pr')
  assert.equal(entry.object, 'tree')
  assert.equal(entry.profile.object, 'tree')
  assert.equal(entry.section.reviewers, 1)
  assert.equal(entry.section.enabled, true)
  assert.deepEqual(entryNames(config), ['draft', 'apply', 'pr'])
  assert.deepEqual(pipelineOf(config), { beforeApply: 'draft', beforeArchive: 'pr' })
  assert.equal(gateEntry(config, 'beforeApply').name, 'draft')
  assert.equal(gateEntry(config, 'beforeArchive').name, 'pr')
})

test('a locked policy resolves the same entry', () => {
  const policy = {
    reviews: {
      draft: {
        object: 'directory', enabled: true, reviewers: 0, waitMinutes: 15, reviewerModel: { source: 'inherit' },
      },
      pr: {
        object: 'tree', enabled: true, reviewers: 1, waitMinutes: 20, reviewerModel: { source: 'inherit' },
      },
    },
    pipeline: { beforeApply: 'draft', beforeArchive: 'pr' },
  }
  const entry = resolveEntry(policy, 'pr')
  assert.equal(entry.object, 'tree')
  assert.equal(entry.profile.object, 'tree')
  assert.equal(entry.section.reviewers, 1)
  assert.equal(entry.section.waitMinutes, 20)
  assert.deepEqual(entryNames(policy), ['draft', 'pr'])
  assert.equal(gateEntry(policy, 'beforeArchive').name, 'pr')
})

test('a legacy policy without an object still resolves draft and apply', () => {
  const policy = { reviews: { draft: { enabled: true }, apply: { enabled: false } } }
  assert.equal(resolveEntry(policy, 'draft').object, 'directory')
  assert.equal(resolveEntry(policy, 'apply').object, 'tree')
  assert.deepEqual(pipelineOf(policy), { beforeApply: 'draft', beforeArchive: 'apply' })
  assert.equal(DEFAULT_ENTRY, 'draft')
})

test('an unknown entry names the configured entries', () => {
  const config = parsedDocument()
  assert.throws(
    () => resolveEntry(config, 'nope'),
    /unknown review entry "nope"; configured entries: draft, apply, pr/,
  )
  assert.throws(
    () => resolveEntry({ reviews: {} }, 'draft'),
    /unknown review entry "draft"; configured entries: none/,
  )
})

test('record files and round prefixes follow the entry name', () => {
  assert.equal(reviewFile('draft'), 'review.json')
  assert.equal(reviewFile('apply'), 'apply-review.json')
  assert.equal(reviewFile('pr'), 'pr-review.json')
  assert.equal(roundPrefix('draft'), 'round')
  assert.equal(roundPrefix('apply'), 'apply-round')
  assert.equal(roundPrefix('pr'), 'pr-round')
  assert.throws(() => reviewFile('PR'), /not a safe entry segment/)
  assert.throws(() => roundPrefix('../draft'), /not a safe entry segment/)
})

test('an entry without a declared object is refused', () => {
  const policy = { reviews: { planning: { enabled: true } } }
  assert.throws(
    () => resolveEntry(policy, 'planning'),
    /review entry "planning" has no review object; expected "directory" or "tree"/,
  )
})
