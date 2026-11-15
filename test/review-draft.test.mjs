import assert from 'node:assert/strict'
import {
  existsSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { cacheKey, clearCache, readCache } from '../lib/cache.js'
import { apply } from '../index.js'
import { createFakeContext } from './fake-context.mjs'
import {
  CHANGE, DRAFT_OPENING, fixture, setup, call, reviewDir, report, majorFinding, captureSpawn, cleanupFixtures,
} from './review-fixtures.mjs'

test.after(cleanupFixtures)

test('self review passes the apply gate', async () => {
  const root = fixture()
  const fake = setup(root)
  const argv = captureSpawn(fake)
  const started = await call(fake, 'openspec_review', {
    action: 'start',
    change: CHANGE,
    intent: 'Add a theme selector and persist it.',
  })
  assert.equal(started.state, 'in-review')
  assert.equal(started.round, 1)
  assert.ok(started.objectHash)
  assert.match(started.brief, /Draft review brief/)
  assert.equal(started.brief.split('\n')[2], DRAFT_OPENING)
  assert.doesNotMatch(started.brief, /you (wrote|drafted|planned)|as the changer/i)
  const validation = argv.find((args) => args.includes('validate'))
  assert.ok(validation, 'the draft start validates the change')
  assert.ok(!validation.includes('--strict'), 'the draft start stays non-strict')

  const submitted = await call(fake, 'openspec_review', {
    action: 'self-report',
    change: CHANGE,
    report: report(),
  })
  assert.equal(submitted.state, 'passed')
  assert.equal(submitted.ready, true)

  const applied = await call(fake, 'openspec_apply_next', { change: CHANGE })
  assert.equal(applied.state, 'all_done')

  const record = JSON.parse(readFileSync(join(reviewDir(root), 'review.json'), 'utf8'))
  assert.equal(record.mode, 'self')
  assert.equal(record.independent, false)
  assert.equal(record.state, 'passed')
  assert.ok(record.applyBaseCommit === undefined || typeof record.applyBaseCommit === 'string')
})

test('an open blocker refuses apply', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start',
    change: CHANGE,
    intent: 'Add a theme selector.',
  })
  const submitted = await call(fake, 'openspec_review', {
    action: 'self-report',
    change: CHANGE,
    report: report({ verdict: 'changes-requested', findings: [majorFinding()] }),
  })
  assert.equal(submitted.ready, false)
  assert.match(submitted.reasons.join(' '), /R1-01 is open/)

  await assert.rejects(
    call(fake, 'openspec_apply_next', { change: CHANGE }),
    /draft review is not ready: .*resume the next round/,
  )
})

test('a later round verifies a fixed blocker and passes apply', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start',
    change: CHANGE,
    intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', {
    action: 'self-report',
    change: CHANGE,
    report: report({ verdict: 'changes-requested', findings: [majorFinding()] }),
  })
  await call(fake, 'openspec_review', {
    action: 'dispose',
    change: CHANGE,
    id: 'R1-01',
    status: 'fixed',
    note: 'Added the missing task.',
  })
  const next = await call(fake, 'openspec_review', {
    action: 'resume',
    change: CHANGE,
    round: 2,
  })
  assert.equal(next.round, 2)
  const verified = await call(fake, 'openspec_review', {
    action: 'self-report',
    change: CHANGE,
    round: 2,
    report: report({
      verifications: [{ id: 'R1-01', status: 'verified-fixed', evidence: 'Checked the new task.' }],
    }),
  })
  assert.equal(verified.ready, true)
  await call(fake, 'openspec_apply_next', { change: CHANGE })
})

test('a user waiver closes a blocker', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start',
    change: CHANGE,
    intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', {
    action: 'self-report',
    change: CHANGE,
    report: report({ verdict: 'changes-requested', findings: [majorFinding()] }),
  })
  const waived = await call(fake, 'openspec_review', {
    action: 'waive',
    change: CHANGE,
    id: 'R1-01',
    waiver: 'Ship without the task; accepted by the user.',
    approvedBy: 'user',
  })
  assert.equal(waived.ready, false)
  await call(fake, 'openspec_review', {
    action: 'resume',
    change: CHANGE,
    round: 2,
  })
  const passed = await call(fake, 'openspec_review', {
    action: 'self-report',
    change: CHANGE,
    round: 2,
    report: report(),
  })
  assert.equal(passed.ready, true)
  await call(fake, 'openspec_apply_next', { change: CHANGE })
})

test('an artifact change invalidates the review', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start',
    change: CHANGE,
    intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', {
    action: 'self-report',
    change: CHANGE,
    report: report(),
  })
  writeFileSync(join(root, 'openspec', 'changes', CHANGE, 'tasks.md'), '\n## 1. New\n\n- [ ] 1.1 New task\n')
  const status = await call(fake, 'openspec_review', { action: 'status', change: CHANGE })
  assert.equal(status.ready, false)
  assert.match(status.reasons.join(' '), /artifacts changed/)
  await assert.rejects(
    call(fake, 'openspec_apply_next', { change: CHANGE }),
    /draft review is not ready/,
  )
})

test('a change created without a model fails closed and leaves no policy', async () => {
  const root = fixture()
  clearCache()
  const fake = createFakeContext({ cwd: root, modelSelection: null })
  apply(fake.ctx, { timeoutMs: 30_000, reviews: { draft: { enabled: false } } })
  await assert.rejects(
    call(fake, 'openspec_new_change', { name: 'add-light-mode' }),
    /no current model is available/,
  )
  assert.equal(existsSync(join(root, 'openspec', 'changes', 'add-light-mode')), false)
  assert.equal(existsSync(join(root, 'openspec', '.review', 'local#add-light-mode')), false)
})

test('the policy locks the reviewer model and ignores a later settings edit', async () => {
  const root = fixture()
  const fake = setup(root, { draft: { enabled: true } })
  const created = await call(fake, 'openspec_new_change', { name: 'add-locked-model' })
  assert.equal(created.change.id, 'add-locked-model')
  const policyPath = join(root, 'openspec', '.review', 'local#add-locked-model', 'policy.json')
  const policy = JSON.parse(readFileSync(policyPath, 'utf8'))
  assert.deepEqual(policy.reviews.draft.reviewerModel, {
    source: 'inherit', provider: 'deepseek', model: 'deepseek-flash', reasoningEffort: 'max',
  })

  // A later settings revision names another model; a review start does not move
  // the locked route, because the policy already carries one.
  const later = setup(root, {
    draft: { enabled: true, reviewerModel: { source: 'explicit', provider: 'other', model: 'other-model' } },
  })
  await call(later, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Review the fixture change.',
  })
  const unchanged = JSON.parse(readFileSync(policyPath, 'utf8'))
  assert.deepEqual(unchanged.reviews.draft.reviewerModel, policy.reviews.draft.reviewerModel)
  const fresh = JSON.parse(readFileSync(join(reviewDir(root), 'policy.json'), 'utf8'))
  assert.deepEqual(fresh.reviews.draft.reviewerModel, {
    source: 'explicit', provider: 'other', model: 'other-model',
  })
})

test('an old policy gains its reviewer model on the first review start', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  const policyPath = join(reviewDir(root), 'policy.json')
  const policy = JSON.parse(readFileSync(policyPath, 'utf8'))
  assert.deepEqual(policy.reviews.draft.reviewerModel, {
    source: 'inherit', provider: 'deepseek', model: 'deepseek-flash', reasoningEffort: 'max',
  })

  // Strip the field to mimic a record written before this capability existed.
  delete policy.reviews.draft.reviewerModel
  writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`)
  await call(fake, 'openspec_review', { action: 'resume', change: CHANGE })
  const migrated = JSON.parse(readFileSync(policyPath, 'utf8'))
  assert.equal(migrated.reviews.draft.reviewerModel.provider, 'deepseek')

  // A second start keeps the migrated value even when the settings now name another model.
  migrated.reviews.draft.reviewerModel = {
    source: 'explicit', provider: 'other', model: 'other-model',
  }
  writeFileSync(policyPath, `${JSON.stringify(migrated, null, 2)}\n`)
  await call(fake, 'openspec_review', { action: 'resume', change: CHANGE })
  assert.equal(JSON.parse(readFileSync(policyPath, 'utf8')).reviews.draft.reviewerModel.provider, 'other')
})

test('the review tool is absent when disabled', async () => {
  const root = fixture()
  const fake = setup(root, { draft: { enabled: false, reviewers: 0 } })
  assert.equal(fake.tools.has('openspec_review'), false)
  const applied = await call(fake, 'openspec_apply_next', { change: CHANGE })
  assert.equal(applied.state, 'all_done')
})

test('status reports a not-started review', async () => {
  const root = fixture()
  const fake = setup(root)
  const status = await call(fake, 'openspec_review', { action: 'status', change: CHANGE })
  assert.equal(status.state, 'not-started')
  assert.equal(status.ready, false)
  assert.equal(status.nextAction, 'openspec_review action=start review=draft')
  assert.match(status.reasons.join(' '), /has not started/)
})

test('the stored report can be read back', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, report: report(),
  })
  const read = await call(fake, 'openspec_review', { action: 'report', change: CHANGE })
  assert.equal(read.report.verdict, 'pass')
  assert.equal(read.report.findings.length, 0)
})

test('extend updates limits and refuses missing approval', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'extend', change: CHANGE, minutes: 15 }),
    /approvedBy user/,
  )
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'extend', change: CHANGE, approvedBy: 'user', reason: 'more time', minutes: 16 }),
    /between 1 and 15/,
  )
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'extend', change: CHANGE, approvedBy: 'user', reason: 'more time' }),
    /needs minutes or maxRounds/,
  )
  const extended = await call(fake, 'openspec_review', {
    action: 'extend', change: CHANGE, approvedBy: 'user', reason: 'more time', minutes: 15, maxRounds: 'unlimited',
  })
  assert.equal(extended.state, 'in-review')
  const record = JSON.parse(readFileSync(join(reviewDir(root), 'review.json'), 'utf8'))
  assert.equal(record.limits.maxRounds, null)
  assert.equal(record.limits.waitMinutes, 30)
  assert.equal(record.extensions.length, 1)
})

test('abandon closes the review', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const abandoned = await call(fake, 'openspec_review', {
    action: 'abandon', change: CHANGE, reason: 'superseded',
  })
  assert.equal(abandoned.state, 'abandoned')
  assert.equal(abandoned.nextAction, 'openspec_new_change')
  assert.match(abandoned.reasons.join(' '), /remove the review record/)
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'start', change: CHANGE, intent: 'Add a theme selector.',
    }),
    /already started/,
  )
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'resume', change: CHANGE }),
    /abandoned/,
  )
})

test('dispose refuses an unknown finding and a deferred blocker', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE,
    report: report({ verdict: 'changes-requested', findings: [majorFinding()] }),
  })
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'dispose', change: CHANGE, id: 'R9-01', status: 'fixed', note: 'no' }),
    /not recorded/,
  )
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'dispose', change: CHANGE, id: 'R1-01', status: 'deferred', note: 'later' }),
    /cannot be deferred/,
  )
})

test('self-report refuses a duplicate report and a wrong round', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'self-report', change: CHANGE, round: 2, report: report() }),
    /current draft round is 1/,
  )
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, report: report(),
  })
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'self-report', change: CHANGE, report: report() }),
    /already has a report/,
  )
})

test('start refuses a missing intent and an invalid round', async () => {
  const root = fixture()
  const fake = setup(root)
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'start', change: CHANGE }),
    /needs intent/,
  )
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'goal', round: 0 }),
    /round must be a positive integer/,
  )
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'goal', review: 'apply' }),
    /apply review is unavailable/,
  )
})

test('start refuses an invalid change', async () => {
  const root = fixture()
  writeFileSync(
    join(root, 'openspec', 'changes', CHANGE, 'specs', 'theme', 'spec.md'),
    '# Theme\n\n## BROKEN Requirements\n\n### Requirement: Broken\nText.\n',
  )
  const fake = setup(root)
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'start', change: CHANGE, intent: 'Add a theme selector.',
    }),
    /draft review refuses an invalid change/,
  )
})

test('a passed review is idempotent and a capped review refuses another round', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, report: report(),
  })
  const again = await call(fake, 'openspec_review', {
    action: 'resume', change: CHANGE,
  })
  assert.equal(again.state, 'passed')
  assert.equal(again.ready, true)
  assert.match(again.brief, /Draft review brief/)

  const cappedRoot = fixture()
  const capped = setup(cappedRoot, { draft: { enabled: true, reviewers: 0, maxRounds: 1 } })
  await call(capped, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await call(capped, 'openspec_review', {
    action: 'self-report', change: CHANGE,
    report: report({ verdict: 'changes-requested', findings: [majorFinding()] }),
  })
  await assert.rejects(
    call(capped, 'openspec_review', {
      action: 'resume', change: CHANGE,
    }),
    /1-round cap/,
  )
})

test('start refuses a round that is not next', async () => {
  const root = fixture()
  const fake = setup(root)
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'start', change: CHANGE, intent: 'Add a theme selector.', round: 2,
    }),
    /next draft review round is 1/,
  )
})

test('self-report refuses artifacts changed before the report', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  writeFileSync(join(root, 'openspec', 'changes', CHANGE, 'tasks.md'), '\n## 1. New\n\n- [ ] 1.1 New task\n')
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'self-report', change: CHANGE, report: report() }),
    /changed since this round started; run openspec_review action=resume review=draft/,
  )
})

test('report and dispose refuse a review that never started', async () => {
  const root = fixture()
  const fake = setup(root)
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'report', change: CHANGE }),
    /no draft review is recorded/,
  )
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'dispose', change: CHANGE, id: 'R1-01', status: 'fixed', note: 'x' }),
    /no draft review is recorded/,
  )
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'extend', change: CHANGE, approvedBy: 'user', reason: 'x', minutes: 1 }),
    /no draft review is recorded/,
  )
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'abandon', change: CHANGE }),
    /no draft review is recorded/,
  )
})

test('dispose and extend validate their inputs', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE,
    report: report({ verdict: 'changes-requested', findings: [majorFinding()] }),
  })
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'dispose', change: CHANGE, id: 'R1-01' }),
    /status must be/,
  )
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'extend', change: CHANGE, approvedBy: 'user', reason: 'x', maxRounds: 0 }),
    /positive integer or unlimited/,
  )
})

test('an unknown review action is refused', async () => {
  const root = fixture()
  const fake = setup(root)
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'unknown', change: CHANGE }),
    /Unsupported review action/,
  )
})

test('the apply gate refuses a missing intent file', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, report: report(),
  })
  rmSync(join(reviewDir(root), 'intent.md'))
  await assert.rejects(
    call(fake, 'openspec_apply_next', { change: CHANGE }),
    /intent file is missing; remove the review record/,
  )
})

test('a policy write failure creates no change', async () => {
  const root = fixture()
  writeFileSync(join(root, 'openspec', '.review'), 'not a directory')
  const fake = setup(root)
  await assert.rejects(
    call(fake, 'openspec_new_change', { name: 'add-light-mode' }),
    /EEXIST|not a directory|exists/i,
  )
  assert.equal(existsSync(join(root, 'openspec', 'changes', 'add-light-mode')), false)
})

test('openspec validation ignores the review directory', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const validation = await call(fake, 'openspec_inspect', {
    action: 'validate', scope: 'all', strict: true,
  })
  assert.equal(validation.valid, true, JSON.stringify(validation.issues))
})

test('a refused gate leaves no cached apply state', async () => {
  const root = fixture()
  const fake = setup(root)
  clearCache()
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE,
    report: report({ verdict: 'changes-requested', findings: [majorFinding()] }),
  })
  await assert.rejects(call(fake, 'openspec_apply_next', { change: CHANGE }), /draft review is not ready/)
  assert.equal(readCache(cacheKey(root, CHANGE, '')), undefined)
})
