import assert from 'node:assert/strict'
import {
  existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { sha256 } from '../lib/review/store.js'
import {
  CHANGE, call, cleanupFixtures, externalSetup, fixture, report, reviewDir, setup,
} from './review-fixtures.mjs'

test.after(cleanupFixtures)

const REVIEWS = { draft: { enabled: true, reviewers: 0 }, apply: { enabled: false } }

function policyFile(root) {
  return join(reviewDir(root), 'policy.json')
}

function recordFile(root) {
  return join(reviewDir(root), 'review.json')
}

function holdLock(root) {
  mkdirSync(join(reviewDir(root), '.lock'), { recursive: true })
}

function releaseLock(root) {
  rmSync(join(reviewDir(root), '.lock'), { recursive: true, force: true })
}

test('a draft start writes nothing before it holds the review lock', async () => {
  const root = fixture()
  const fake = setup(root, REVIEWS)
  holdLock(root)
  await assert.rejects(
    () => call(fake, 'openspec_review', {
      action: 'start', change: CHANGE, intent: 'Add a theme selector.',
    }),
    /another write holds/,
  )
  assert.equal(existsSync(policyFile(root)), false, 'no policy outside the lock')
  assert.equal(existsSync(recordFile(root)), false, 'no record outside the lock')
  assert.equal(existsSync(join(root, 'openspec', '.gitignore')), false, 'no ignore line outside the lock')
  releaseLock(root)
  const started = await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  assert.equal(started.state, 'in-review')
  const policy = JSON.parse(readFileSync(policyFile(root), 'utf8'))
  assert.equal(policy.reviews.draft.enabled, true)
  assert.equal(existsSync(join(reviewDir(root), '.lock')), false)
})

test('a draft resume judges the intent only while it holds the review lock', async () => {
  const root = fixture()
  const fake = setup(root, REVIEWS)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  writeFileSync(join(reviewDir(root), 'intent.md'), 'A different intent.\n')
  holdLock(root)
  await assert.rejects(
    () => call(fake, 'openspec_review', { action: 'resume', change: CHANGE }),
    /another write holds/,
  )
  releaseLock(root)
  await assert.rejects(
    () => call(fake, 'openspec_review', { action: 'resume', change: CHANGE }),
    /the review intent file changed after the review started/,
  )
})

test('a self-report reads the intent only while it holds the review lock', async () => {
  const root = fixture()
  const fake = setup(root, REVIEWS)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  rmSync(join(reviewDir(root), 'intent.md'))
  holdLock(root)
  await assert.rejects(
    () => call(fake, 'openspec_review', { action: 'self-report', change: CHANGE, report: report() }),
    /another write holds/,
  )
  releaseLock(root)
  await assert.rejects(
    () => call(fake, 'openspec_review', { action: 'self-report', change: CHANGE, report: report() }),
    /the review intent file is missing/,
  )
})

test('a disabled draft policy still refuses the start with the same error', async () => {
  const root = fixture()
  const fake = setup(root, { draft: { enabled: false }, apply: { enabled: true } })
  await assert.rejects(
    () => call(fake, 'openspec_review', {
      action: 'start', change: CHANGE, intent: 'Add a theme selector.',
    }),
    /draft review is disabled for this change/,
  )
  assert.equal(existsSync(policyFile(root)), true)
  assert.equal(existsSync(recordFile(root)), false)
})

test('a start that holds the lock makes the second start report the holder', async () => {
  const root = fixture()
  const { fake, subagents } = externalSetup(root, {
    draft: { enabled: true, reviewers: 1 },
    apply: { enabled: false },
  })
  let entering
  let release
  const entered = new Promise((resolve) => { entering = resolve })
  const gate = new Promise((resolve) => { release = resolve })
  subagents.startActivation = async () => {
    entering()
    await gate
    return { childId: 'reviewer-1' }
  }
  const winner = call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'The first attempt.',
  })
  await entered
  const policy = JSON.parse(readFileSync(policyFile(root), 'utf8'))
  assert.equal(policy.reviews.draft.reviewers, 1)
  assert.equal(existsSync(join(reviewDir(root), '.lock')), true)
  await assert.rejects(
    () => call(fake, 'openspec_review', {
      action: 'start', change: CHANGE, intent: 'The second attempt.',
    }),
    /another write holds/,
  )
  release()
  const started = await winner
  assert.equal(started.state, 'in-review')
  assert.equal(started.mode, 'reviewer')
  const record = JSON.parse(readFileSync(recordFile(root), 'utf8'))
  assert.equal(record.state, 'in-review')
  assert.equal(record.policyHash, sha256(JSON.stringify(policy)))
  assert.equal(existsSync(join(reviewDir(root), '.lock')), false)
  assert.deepEqual(readdirSync(reviewDir(root)).filter((name) => name.endsWith('.tmp')), [])
})
