import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { DEFAULT_REVIEW_CONFIG, normalizeProfile, normalizeReviewDocument, normalizeReviewerModel, reviewSection } from '../lib/review/config.js'
import {
  defaultReviewConfigText,
  readReviewConfig,
  recordedConfigPath,
  reviewConfigPath,
} from '../lib/review/file.js'
import { cleanupTempDirs, tempDir } from './temp.mjs'

test.after(cleanupTempDirs)

function project() {
  const root = tempDir('openspec-flow-review-file-')
  mkdirSync(join(root, 'openspec'), { recursive: true })
  return root
}

function document() {
  return structuredClone(DEFAULT_REVIEW_CONFIG)
}

function write(root, value, name = 'reviews.json') {
  writeFileSync(join(root, 'openspec', name), `${JSON.stringify(value, null, 2)}\n`)
}

function issuesOf(result) {
  return result.issues.map((issue) => issue.message).join(' ')
}

test('a valid document resolves both entries and records the source', () => {
  const root = project()
  write(root, document())
  const result = readReviewConfig(root)
  assert.equal(result.ok, true)
  assert.equal(result.value.reviews.draft, 'standard-directory')
  assert.equal(result.value.reviews.apply, 'standard-tree')
  assert.equal(result.value.draft.object, 'directory')
  assert.equal(result.value.apply.object, 'tree')
  assert.equal(result.value.draft.reviewers, 0)
  assert.deepEqual(result.value.draft.reviewerModel, { source: 'inherit' })
  assert.equal(result.source.path, 'openspec/reviews.json')
  assert.match(result.source.sha256, /^[0-9a-f]{64}$/)
  assert.deepEqual(result.source.profiles, {
    draft: 'standard-directory',
    apply: 'standard-tree',
  })
})

test('a missing file fails with its path', () => {
  const root = project()
  const result = readReviewConfig(root)
  assert.equal(result.ok, false)
  assert.match(issuesOf(result), /not found/)
  assert.equal(result.issues[0].path, reviewConfigPath(root))
})

test('an unparsable file fails', () => {
  const root = project()
  writeFileSync(join(root, 'openspec', 'reviews.json'), '{ not json')
  const result = readReviewConfig(root)
  assert.equal(result.ok, false)
  assert.match(issuesOf(result), /not valid JSON/)
})

test('reviewers above the bound is refused', () => {
  const root = project()
  const value = document()
  value.profiles['standard-tree'].reviewers = 2
  write(root, value)
  const result = readReviewConfig(root)
  assert.equal(result.ok, false)
  assert.match(issuesOf(result), /reviewers must be 0 or 1/)
})

test('a round cap is refused', () => {
  const root = project()
  const value = document()
  value.profiles['standard-tree'].maxRounds = 5
  write(root, value)
  const result = readReviewConfig(root)
  assert.equal(result.ok, false)
  assert.match(issuesOf(result), /maxRounds is not supported/)
})

test('a wait limit below the bound is refused', () => {
  const root = project()
  const value = document()
  value.profiles['standard-directory'].waitMinutes = 0
  write(root, value)
  const result = readReviewConfig(root)
  assert.equal(result.ok, false)
  assert.match(issuesOf(result), /waitMinutes must be an integer between 1 and 120/)
})

test('a missing parameter is refused instead of defaulted', () => {
  const root = project()
  const value = document()
  delete value.profiles['standard-directory'].reviewers
  write(root, value)
  const result = readReviewConfig(root)
  assert.equal(result.ok, false)
  assert.match(issuesOf(result), /reviewers is required/)
})

test('a draft entry naming a tree profile is refused', () => {
  const root = project()
  const value = document()
  value.reviews.draft = 'standard-tree'
  write(root, value)
  const result = readReviewConfig(root)
  assert.equal(result.ok, false)
  assert.match(issuesOf(result), /reviews\.draft must name a profile whose object is "directory"/)
})

test('a missing entry is refused', () => {
  const root = project()
  const value = document()
  delete value.reviews.apply
  write(root, value)
  const result = readReviewConfig(root)
  assert.equal(result.ok, false)
  assert.match(issuesOf(result), /reviews\.apply is required/)
})

test('an entry naming an absent profile is refused', () => {
  const root = project()
  const value = document()
  value.reviews.draft = 'missing-profile'
  write(root, value)
  const result = readReviewConfig(root)
  assert.equal(result.ok, false)
  assert.match(issuesOf(result), /which profiles does not declare/)
})

test('an unsupported entry such as pr is refused', () => {
  const root = project()
  const value = document()
  value.reviews.pr = 'standard-tree'
  write(root, value)
  const result = readReviewConfig(root)
  assert.equal(result.ok, false)
  assert.match(issuesOf(result), /reviews\.pr is not a supported review entry/)
})

test('an unknown profile key is refused', () => {
  const root = project()
  const value = document()
  value.profiles['standard-directory'].model = 'x'
  write(root, value)
  const result = readReviewConfig(root)
  assert.equal(result.ok, false)
  assert.match(issuesOf(result), /model is not supported/)
})

test('an unknown top-level key is refused', () => {
  const root = project()
  const value = document()
  value.defaults = {}
  write(root, value)
  const result = readReviewConfig(root)
  assert.equal(result.ok, false)
  assert.match(issuesOf(result), /defaults is not supported at the top level/)
})

test('a relative configPath resolves against the project root', () => {
  const root = project()
  mkdirSync(join(root, 'custom'), { recursive: true })
  writeFileSync(join(root, 'custom', 'reviews.json'), `${JSON.stringify(document(), null, 2)}\n`)
  const result = readReviewConfig(root, { configPath: 'custom/reviews.json' })
  assert.equal(result.ok, true)
  assert.equal(result.source.path, 'custom/reviews.json')
})

test('an absolute configPath outside the root records the absolute path', () => {
  const root = project()
  const outside = tempDir('openspec-flow-review-file-outside-')
  const file = join(outside, 'reviews.json')
  writeFileSync(file, `${JSON.stringify(document(), null, 2)}\n`)
  const result = readReviewConfig(root, { configPath: file })
  assert.equal(result.ok, true)
  assert.equal(result.source.path, file)
  assert.equal(recordedConfigPath(root, file), file)
})

test('an explicit reviewer model is accepted', () => {
  const root = project()
  const value = document()
  value.profiles['standard-tree'].reviewerModel = {
    source: 'explicit',
    provider: 'deepseek-account',
    model: 'deepseek-flash',
  }
  write(root, value)
  const result = readReviewConfig(root)
  assert.equal(result.ok, true)
  assert.deepEqual(result.value.apply.reviewerModel, {
    source: 'explicit',
    provider: 'deepseek-account',
    model: 'deepseek-flash',
  })
})

test('the default document is valid and round-trips through the reader', () => {
  const root = project()
  writeFileSync(join(root, 'openspec', 'reviews.json'), defaultReviewConfigText())
  const result = readReviewConfig(root)
  assert.equal(result.ok, true)
  assert.equal(result.value.reviews.draft, 'standard-directory')
  assert.equal(result.value.reviews.apply, 'standard-tree')
})

test('the profile validator refuses every malformed parameter', () => {
  const malformed = [
    'not-an-object',
    { object: 'blob', enabled: true, reviewers: 0, waitMinutes: 15, reviewerModel: { source: 'inherit' } },
    { object: 'directory', enabled: 'yes', reviewers: 0, waitMinutes: 15, reviewerModel: { source: 'inherit' } },
    { object: 'directory', enabled: true, reviewers: 'x', waitMinutes: 15, reviewerModel: { source: 'inherit' } },
    { object: 'directory', enabled: true, reviewers: 0, waitMinutes: 'x', reviewerModel: { source: 'inherit' } },
    { object: 'directory', enabled: true, reviewers: 0, waitMinutes: 15 },
    { object: 'directory', enabled: true, reviewers: 0, waitMinutes: 15, reviewerModel: { source: 'inherit' }, extra: 1 },
  ]
  for (const raw of malformed) {
    const issues = []
    normalizeProfile(raw, 'p', issues)
    assert.ok(issues.length > 0, JSON.stringify(raw))
  }
})

test('the reviewer model validator refuses every malformed route', () => {
  const cases = [
    ['not-an-object', /must be an object/],
    [{ source: 'other' }, /source must be/],
    [{ source: 'inherit', provider: 'p' }, /not allowed/],
    [{ source: 'explicit' }, /provider must be/],
    [{ source: 'explicit', provider: 'p', model: 'm', reasoningEffort: ' ' }, /reasoningEffort must be/],
    [{ source: 'inherit', extra: 1 }, /extra is not supported/],
  ]
  for (const [raw, pattern] of cases) {
    const issues = []
    normalizeReviewerModel(raw, 'm', issues)
    assert.ok(issues.some((issue) => pattern.test(issue.message)), JSON.stringify(issues))
  }
  assert.deepEqual(normalizeReviewerModel(undefined, 'm', []), { source: 'inherit' })
  assert.deepEqual(
    normalizeReviewerModel({ source: 'explicit', provider: 'p', model: 'm' }, 'm', []),
    { source: 'explicit', provider: 'p', model: 'm' },
  )
})

test('the document validator refuses a malformed top level', () => {
  assert.ok(normalizeReviewDocument('x').issues.length > 0)
  assert.ok(normalizeReviewDocument({ profiles: {}, reviews: {} }).issues.length > 0)
  assert.ok(normalizeReviewDocument({ profiles: [], reviews: { draft: 'a', apply: 'b' } }).issues.length > 0)
  assert.ok(normalizeReviewDocument({ profiles: {}, reviews: 'nope' }).issues.length > 0)
  const shared = {
    profiles: {
      only: {
        object: 'tree', enabled: true, reviewers: 0, waitMinutes: 15, reviewerModel: { source: 'inherit' },
      },
    },
    reviews: { draft: 'only', apply: 'only' },
  }
  assert.ok(normalizeReviewDocument(shared).issues.length > 0)
  assert.deepEqual(reviewSection(undefined, 'draft'), {
    enabled: false, reviewers: 0, waitMinutes: 15, reviewerModel: { source: 'inherit' },
  })
  assert.deepEqual(
    reviewSection({ draft: { enabled: true, reviewers: 1, waitMinutes: 30, reviewerModel: { source: 'inherit' } } }, 'draft'),
    { enabled: true, reviewers: 1, waitMinutes: 30, reviewerModel: { source: 'inherit' } },
  )
})
