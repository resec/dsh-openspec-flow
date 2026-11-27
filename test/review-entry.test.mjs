import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import {
  CHANGE, cleanupFixtures, fixture, gitFixture, passDraft, report, reviewDir, setup, call, majorFinding,
} from './review-fixtures.mjs'
import { DEFAULT_REVIEW_CONFIG, normalizeReviewDocument } from '../lib/review/config.js'
import { DEFAULT_ENTRY, entryNames, gateEntry, pipelineOf, resolveEntry } from '../lib/review/entry.js'
import { reviewFile, roundPrefix } from '../lib/review/record.js'

test.after(cleanupFixtures)

function entryConfig({ pr = true, directoryEntry = 'draft' } = {}) {
  const profiles = {
    'test-directory': { object: 'directory', enabled: true, reviewers: 0, waitMinutes: 15, reviewerModel: { source: 'inherit' } },
    'test-apply': { object: 'tree', enabled: true, reviewers: 0, waitMinutes: 15, reviewerModel: { source: 'inherit' } },
  }
  const reviews = { [directoryEntry]: 'test-directory', apply: 'test-apply' }
  if (pr) {
    profiles['pr-tree'] = { object: 'tree', enabled: true, reviewers: 0, waitMinutes: 15, reviewerModel: { source: 'inherit' } }
    reviews.pr = 'pr-tree'
  }
  return {
    profiles,
    reviews,
    pipeline: { beforeApply: directoryEntry, beforeArchive: pr ? 'pr' : 'apply' },
  }
}

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

test('a pr tree entry starts, reports, disposes and reads its own record', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root, undefined, { reviewFile: `${JSON.stringify(entryConfig(), null, 2)}\n` })
  await passDraft(fake, root, run)
  const started = await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'pr' })
  assert.equal(started.review, 'pr')
  assert.match(started.brief, /Pr review brief/)
  assert.equal(existsSync(join(reviewDir(root), 'pr-review.json')), true)
  assert.equal(existsSync(join(reviewDir(root), 'apply-review.json')), false)
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, review: 'pr',
    report: report({ verdict: 'changes-requested', findings: [majorFinding()] }),
  })
  const disposed = await call(fake, 'openspec_review', {
    action: 'dispose', change: CHANGE, review: 'pr', id: 'R1-01', status: 'fixed', note: 'Fixed.',
  })
  assert.equal(disposed.review, 'pr')
  assert.equal(disposed.findings.fixed, 1)
  const status = await call(fake, 'openspec_review', { action: 'status', change: CHANGE, review: 'pr' })
  assert.equal(status.review, 'pr')
})

test('an unknown entry is refused with the configured entries', async () => {
  const root = fixture()
  const fake = setup(root, undefined, { reviewFile: `${JSON.stringify(entryConfig(), null, 2)}\n` })
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'status', change: CHANGE, review: 'nope' }),
    /unknown review entry "nope"; configured entries: draft, apply, pr/,
  )
})

test('a directory entry under another name runs the directory flow', async () => {
  const root = fixture()
  const fake = setup(root, undefined, { reviewFile: `${JSON.stringify(entryConfig({ pr: false, directoryEntry: 'planning' }), null, 2)}\n` })
  const started = await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, review: 'planning', intent: 'Add a theme selector.',
  })
  assert.equal(started.review, 'planning')
  assert.match(started.brief, /Planning review brief/)
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, review: 'planning', report: report(),
  })
  assert.equal(existsSync(join(reviewDir(root), 'planning-review.json')), true)
  assert.equal(existsSync(join(reviewDir(root), 'review.json')), false)
  const status = await call(fake, 'openspec_review', { action: 'status', change: CHANGE, review: 'planning' })
  assert.equal(status.review, 'planning')
})

test('an empty review entry name is refused with the configured entries rule', async () => {
  const root = fixture()
  const fake = setup(root, undefined, { reviewFile: `${JSON.stringify(entryConfig(), null, 2)}\n` })
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'status', change: CHANGE, review: '  ' }),
    /review must name a configured review entry/,
  )
})
