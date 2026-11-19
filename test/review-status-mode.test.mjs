import assert from 'node:assert/strict'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import {
  CHANGE, call, cleanupFixtures, fixture, gitFixture, reviewDir, setup, writePolicy,
} from './review-fixtures.mjs'

test.after(cleanupFixtures)

test('apply status reports the locked reviewer mode before start', async () => {
  const { root } = gitFixture()
  writePolicy(root, CHANGE, {
    draft: { enabled: true, reviewers: 1 },
    apply: { enabled: true, reviewers: 1 },
  })
  const fake = setup(root)
  const status = await call(fake, 'openspec_review', { action: 'status', change: CHANGE, review: 'apply' })
  assert.equal(status.mode, 'reviewer')
  assert.equal(status.independent, true)
  assert.equal(status.policy, true)
  assert.equal(status.enabled, true)
  assert.equal(status.available, true)
})

test('draft status reports the locked reviewer mode before start', async () => {
  const root = fixture()
  writePolicy(root, CHANGE, {
    draft: { enabled: true, reviewers: 1 },
    apply: { enabled: false, reviewers: 0 },
  })
  const fake = setup(root)
  const status = await call(fake, 'openspec_review', { action: 'status', change: CHANGE, review: 'draft' })
  assert.equal(status.mode, 'reviewer')
  assert.equal(status.independent, true)
})

test('status reports self mode for reviewers 0', async () => {
  const root = fixture()
  writePolicy(root, CHANGE, {
    draft: { enabled: true, reviewers: 0 },
    apply: { enabled: false, reviewers: 0 },
  })
  const fake = setup(root)
  const draft = await call(fake, 'openspec_review', { action: 'status', change: CHANGE, review: 'draft' })
  assert.equal(draft.mode, 'self')
  assert.equal(draft.independent, false)
})

test('a disabled apply policy keeps self mode', async () => {
  const { root } = gitFixture()
  writePolicy(root, CHANGE, {
    draft: { enabled: true, reviewers: 1 },
    apply: { enabled: false, reviewers: 1 },
  })
  const fake = setup(root)
  const status = await call(fake, 'openspec_review', { action: 'status', change: CHANGE, review: 'apply' })
  assert.equal(status.mode, 'self')
  assert.equal(status.independent, false)
  assert.equal(status.enabled, false)
  assert.equal(status.nextAction, 'openspec_archive')
})

test('a disabled draft policy keeps self mode', async () => {
  const root = fixture()
  writePolicy(root, CHANGE, {
    draft: { enabled: false, reviewers: 1 },
    apply: { enabled: false, reviewers: 0 },
  })
  const fake = setup(root)
  const status = await call(fake, 'openspec_review', { action: 'status', change: CHANGE, review: 'draft' })
  assert.equal(status.mode, 'self')
  assert.equal(status.independent, false)
  assert.equal(status.nextAction, 'openspec_review action=start review=draft')
})

test('a no-git project keeps self mode for apply status', async () => {
  const root = fixture()
  writePolicy(root, CHANGE, {
    draft: { enabled: true, reviewers: 1 },
    apply: { enabled: true, reviewers: 1 },
  })
  const fake = setup(root)
  const status = await call(fake, 'openspec_review', { action: 'status', change: CHANGE, review: 'apply' })
  assert.equal(status.available, false)
  assert.equal(status.mode, 'self')
  assert.equal(status.independent, false)
})

test('status without a locked policy reports self and does not fail', async () => {
  const root = fixture()
  const fake = setup(root)
  const draft = await call(fake, 'openspec_review', { action: 'status', change: CHANGE, review: 'draft' })
  assert.equal(draft.mode, 'self')
  assert.equal(draft.independent, false)
  const apply = await call(fake, 'openspec_review', { action: 'status', change: CHANGE, review: 'apply' })
  assert.equal(apply.mode, 'self')
  assert.equal(apply.independent, false)
  assert.equal(apply.policy, false)
})

test('a corrupt policy fails draft and apply status the same way', async () => {
  const { root } = gitFixture()
  writePolicy(root, CHANGE, {
    draft: { enabled: true, reviewers: 1 },
    apply: { enabled: true, reviewers: 1 },
  })
  writeFileSync(join(reviewDir(root), 'policy.json'), '{')
  const fake = setup(root)
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'status', change: CHANGE, review: 'draft' }),
    /cannot parse/,
  )
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'status', change: CHANGE, review: 'apply' }),
    /cannot parse/,
  )
})

test('a recorded review keeps its mode when the policy changes', async () => {
  const root = fixture()
  const fake = setup(root, { draft: { enabled: true, reviewers: 0 }, apply: { enabled: false, reviewers: 0 } })
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  writePolicy(root, CHANGE, {
    draft: { enabled: true, reviewers: 1 },
    apply: { enabled: false, reviewers: 0 },
  })
  const status = await call(fake, 'openspec_review', { action: 'status', change: CHANGE, review: 'draft' })
  assert.equal(status.mode, 'self')
  assert.equal(status.independent, false)
})

test('apply status reports self mode for reviewers 0', async () => {
  const { root } = gitFixture()
  writePolicy(root, CHANGE, {
    draft: { enabled: true, reviewers: 0 },
    apply: { enabled: true, reviewers: 0 },
  })
  const fake = setup(root)
  const status = await call(fake, 'openspec_review', { action: 'status', change: CHANGE, review: 'apply' })
  assert.equal(status.mode, 'self')
  assert.equal(status.independent, false)
})

test('a recorded reviewer review keeps its mode when the policy is absent', async () => {
  const root = fixture()
  const fake = setup(root, { draft: { enabled: true, reviewers: 0 }, apply: { enabled: false, reviewers: 0 } })
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  const recordPath = join(reviewDir(root), 'review.json')
  const record = JSON.parse(readFileSync(recordPath, 'utf8'))
  record.mode = 'reviewer'
  record.independent = true
  writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`)
  rmSync(join(reviewDir(root), 'policy.json'))
  const status = await call(fake, 'openspec_review', { action: 'status', change: CHANGE, review: 'draft' })
  assert.equal(status.mode, 'reviewer')
  assert.equal(status.independent, true)
})
