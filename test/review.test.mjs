import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { apply } from '../index.js'
import { apply as reviewerApply } from '../reviewer.js'
import { cacheKey, clearCache, readCache } from '../lib/cache.js'
import { createFakeContext } from './fake-context.mjs'

const PROBE_ROOT = fileURLToPath(new URL('../../.probe/proj/openspec', import.meta.url))
const CHANGE = 'add-dark-mode'
const CREATED = []

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'openspec-flow-review-'))
  cpSync(PROBE_ROOT, join(root, 'openspec'), { recursive: true })
  CREATED.push(root)
  return root
}

function setup(root, reviews) {
  clearCache()
  const fake = createFakeContext({ cwd: root })
  apply(fake.ctx, {
    timeoutMs: 30_000,
    reviews: reviews ?? { draft: { enabled: true }, apply: { enabled: true } },
  })
  return fake
}

async function call(fake, name, args) {
  const tool = fake.tools.get(name)
  assert.ok(tool, `tool ${name} is registered`)
  return await tool.execute(args, {
    agent: { id: 'review-test' },
    signal: new AbortController().signal,
  })
}

function reviewDir(root) {
  return join(root, 'openspec', '.review', `local#${CHANGE}`)
}

function report(extra = {}) {
  return {
    verdict: 'pass',
    summary: 'The planning artifacts are coherent.',
    findings: [],
    verifications: [],
    outOfScope: [],
    residualRisks: [],
    ...extra,
  }
}

function majorFinding() {
  return {
    id: 'R1-01',
    severity: 'major',
    axis: 'coherence',
    location: 'proposal.md',
    title: 'Task misses the new capability',
    problem: 'The proposal adds a capability that tasks do not implement.',
    evidence: 'proposal.md adds capability theme; tasks.md has no matching task.',
    impact: 'The implementation would ship without the requested behavior.',
    rule: 'proposal.md Capabilities and tasks.md coverage',
    failure: 'An agent follows tasks.md and never adds the capability.',
    suggestion: 'Add a task that implements the capability.',
  }
}

test.after(() => {
  for (const root of CREATED) rmSync(root, { recursive: true, force: true })
})

test('self review passes the apply gate', async () => {
  const root = fixture()
  const fake = setup(root)
  const started = await call(fake, 'openspec_review', {
    action: 'start',
    change: CHANGE,
    intent: 'Add a theme selector and persist it.',
  })
  assert.equal(started.state, 'in-review')
  assert.equal(started.round, 1)
  assert.ok(started.objectHash)
  assert.match(started.brief, /Draft review brief/)

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
    /draft review is not ready/,
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
    action: 'start',
    change: CHANGE,
    intent: 'Add a theme selector.',
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
    action: 'start',
    change: CHANGE,
    intent: 'Add a theme selector.',
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

test('new change locks a policy and ignores later settings', async () => {
  const root = fixture()
  const fake = setup(root, { draft: { enabled: false, reviewers: 0 } })
  const created = await call(fake, 'openspec_new_change', { name: 'add-light-mode' })
  assert.equal(created.change.id, 'add-light-mode')
  const policyPath = join(root, 'openspec', '.review', 'local#add-light-mode', 'policy.json')
  assert.equal(existsSync(policyPath), true)
  const policy = JSON.parse(readFileSync(policyPath, 'utf8'))
  assert.equal(policy.reviews.draft.enabled, false)
  assert.match(readFileSync(join(root, 'openspec', '.gitignore'), 'utf8'), /\.review\//)
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
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  const migrated = JSON.parse(readFileSync(policyPath, 'utf8'))
  assert.equal(migrated.reviews.draft.reviewerModel.provider, 'deepseek')

  // A second start keeps the migrated value even when the settings now name another model.
  migrated.reviews.draft.reviewerModel = {
    source: 'explicit', provider: 'other', model: 'other-model',
  }
  writeFileSync(policyPath, `${JSON.stringify(migrated, null, 2)}\n`)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  assert.equal(JSON.parse(readFileSync(policyPath, 'utf8')).reviews.draft.reviewerModel.provider, 'other')
})

test('the reviewer activation carries the locked model and refuses an unavailable one', async () => {
  const root = fixture()
  const { fake, activations } = externalSetup(root)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  assert.deepEqual(activations[0].agentOptions, {
    provider: 'deepseek', model: 'deepseek-flash', reasoningEffort: 'max',
  })
  assert.equal(activations[0].agentPreset, 'openspec-reviewer')
  assert.equal(activations[0].parent.id, 'review-test')
  assert.equal(activations[0].request, undefined)

  // An explicit model the catalog does not know is refused before an activation exists.
  const missing = fixture()
  const missingSetup = externalSetup(missing, {
    draft: {
      enabled: true,
      reviewers: 1,
      reviewerModel: { source: 'explicit', provider: 'deepseek', model: 'missing-model' },
    },
  })
  await assert.rejects(
    call(missingSetup.fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' }),
    /model 'deepseek\/missing-model' is unavailable/,
  )
  assert.equal(missingSetup.activations.length, 0)

  // An unknown effort is refused the same way.
  const effort = fixture()
  const effortSetup = externalSetup(effort, {
    draft: {
      enabled: true,
      reviewers: 1,
      reviewerModel: { source: 'explicit', provider: 'deepseek', model: 'deepseek-flash', reasoningEffort: 'low' },
    },
  })
  await assert.rejects(
    call(effortSetup.fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' }),
    /reasoning effort 'low' is unavailable/,
  )
  assert.equal(effortSetup.activations.length, 0)
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
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'start', change: CHANGE, intent: 'Add a theme selector.',
    }),
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

test('apply refuses a policy that has no review record', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_new_change', { name: 'add-light-mode' })
  await assert.rejects(
    call(fake, 'openspec_apply_next', { change: 'add-light-mode' }),
    /draft review has not started/,
  )
})

test('a git project records the apply base commit', async () => {
  const root = fixture()
  const run = (args) => {
    const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  run(['init'])
  run(['config', 'user.email', 'test@example.com'])
  run(['config', 'user.name', 'Test'])
  run(['add', 'openspec'])
  run(['commit', '-m', 'fixture'])
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, report: report(),
  })
  await call(fake, 'openspec_apply_next', { change: CHANGE })
  const record = JSON.parse(readFileSync(join(reviewDir(root), 'review.json'), 'utf8'))
  assert.equal(record.applyBaseCommit, run(['rev-parse', 'HEAD']))
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
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  assert.equal(again.state, 'passed')
  assert.equal(again.ready, true)

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
      action: 'start', change: CHANGE, intent: 'Add a theme selector.',
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
    /changed since this round started/,
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
    /intent file is missing/,
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

function gitFixture() {
  const root = fixture()
  const run = (args) => {
    const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  run(['init'])
  run(['config', 'user.email', 'test@example.com'])
  run(['config', 'user.name', 'Test'])
  run(['add', 'openspec'])
  run(['commit', '-m', 'fixture'])
  return { root, run }
}

async function passDraft(fake, root, run) {
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, report: report(),
  })
  await call(fake, 'openspec_apply_next', { change: CHANGE })
  if (run !== undefined) {
    const ignore = join(root, 'openspec', '.gitignore')
    if (existsSync(ignore) && run(['status', '--porcelain', '--', 'openspec/.gitignore']) !== '') {
      run(['add', 'openspec/.gitignore'])
      run(['commit', '-m', 'add review ignore'])
    }
  }
}

test('apply review starts on the committed tree and records its base', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  const started = await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, review: 'apply',
  })
  assert.equal(started.review, 'apply')
  assert.equal(started.treeSha, run(['rev-parse', 'HEAD^{tree}']))
  assert.ok(started.brief)
  assert.match(started.brief, /Apply review brief/)
  const record = JSON.parse(readFileSync(join(reviewDir(root), 'apply-review.json'), 'utf8'))
  assert.equal(record.objectKind, 'tree')
  assert.equal(record.baseTreeSha, run(['rev-parse', `${record.baseCommit}^{tree}`]))
})

test('apply review refuses a dirty tree', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  writeFileSync(join(root, 'openspec', 'changes', CHANGE, 'proposal.md'), '# Changed\n')
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' }),
    /clean working tree/,
  )
})

test('apply review refuses artifacts that differ from the draft', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  writeFileSync(join(root, 'openspec', 'changes', CHANGE, 'tasks.md'), '\n## 1. New\n\n- [ ] 1.1 New task\n')
  run(['add', 'openspec'])
  run(['commit', '-m', 'change plan'])
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' }),
    /differ from the reviewed draft/,
  )
})

test('a ready apply review allows archive and a blocker refuses it', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  const blocked = await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, review: 'apply',
    report: report({ verdict: 'changes-requested', findings: [majorFinding()] }),
  })
  assert.equal(blocked.ready, false)
  await assert.rejects(
    call(fake, 'openspec_archive', { change: CHANGE }),
    /apply review is not ready/,
  )
  assert.equal(existsSync(join(root, 'openspec', 'changes', CHANGE)), true)

  await call(fake, 'openspec_review', {
    action: 'waive', change: CHANGE, review: 'apply',
    id: 'R1-01', waiver: 'accepted by the user', approvedBy: 'user',
  })
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, review: 'apply', round: 2,
  })
  const passed = await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, review: 'apply', round: 2, report: report(),
  })
  assert.equal(passed.ready, true)
  const archived = await call(fake, 'openspec_archive', { change: CHANGE })
  assert.equal(archived.archived, true)
})

test('moving HEAD after an apply pass refuses archive', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, review: 'apply', report: report(),
  })
  writeFileSync(join(root, 'notes.txt'), 'new content\n')
  run(['add', 'notes.txt'])
  run(['commit', '-m', 'move'])
  await assert.rejects(
    call(fake, 'openspec_archive', { change: CHANGE }),
    /tree no longer matches HEAD/,
  )
})

test('apply review is unavailable without git', async () => {
  const root = fixture()
  const fake = setup(root)
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' }),
    /no git repository/,
  )
})

test('apply review can run with draft review disabled and an explicit base', async () => {
  const { root, run } = gitFixture()
  const base = run(['rev-parse', 'HEAD'])
  const fake = setup(root, { draft: { enabled: false }, apply: { enabled: true } })
  const started = await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, review: 'apply', base,
  })
  assert.equal(started.review, 'apply')
  const record = JSON.parse(readFileSync(join(reviewDir(root), 'apply-review.json'), 'utf8'))
  assert.equal(record.baseCommit, base)
})

test('apply review is idempotent after pass and refuses a capped round', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, review: 'apply', report: report(),
  })
  const again = await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, review: 'apply',
  })
  assert.equal(again.state, 'passed')

  const cappedRoot = gitFixture()
  const capped = setup(cappedRoot.root, {
    draft: { enabled: true }, apply: { enabled: true, maxRounds: 1 },
  })
  await passDraft(capped, cappedRoot.root, cappedRoot.run)
  await call(capped, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  await call(capped, 'openspec_review', {
    action: 'self-report', change: CHANGE, review: 'apply',
    report: report({ verdict: 'changes-requested', findings: [majorFinding()] }),
  })
  await assert.rejects(
    call(capped, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' }),
    /1-round cap/,
  )
})

test('apply review supports status, report, extend, dispose and abandon', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  const status = await call(fake, 'openspec_review', {
    action: 'status', change: CHANGE, review: 'apply',
  })
  assert.equal(status.state, 'not-started')
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'report', change: CHANGE, review: 'apply' }),
    /no report/,
  )
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'dispose', change: CHANGE, review: 'apply', id: 'R1-01', status: 'fixed', note: 'x',
    }),
    /not recorded/,
  )
  const extended = await call(fake, 'openspec_review', {
    action: 'extend', change: CHANGE, review: 'apply', approvedBy: 'user', reason: 'more', minutes: 10,
  })
  assert.equal(extended.state, 'in-review')
  const abandoned = await call(fake, 'openspec_review', {
    action: 'abandon', change: CHANGE, review: 'apply', reason: 'superseded',
  })
  assert.equal(abandoned.state, 'abandoned')
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' }),
    /abandoned/,
  )
})

test('archive refuses before an apply review and after dirtying the tree', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  await assert.rejects(
    call(fake, 'openspec_archive', { change: CHANGE }),
    /apply review has not started/,
  )
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, review: 'apply', report: report(),
  })
  writeFileSync(join(root, 'dirty.txt'), 'dirty\n')
  await assert.rejects(
    call(fake, 'openspec_archive', { change: CHANGE }),
    /clean working tree/,
  )
})

test('apply status is unavailable without git', async () => {
  const root = fixture()
  const fake = setup(root)
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'status', change: CHANGE, review: 'apply' }),
    /no git repository/,
  )
})

test('starting the same round twice before a report resumes it', async () => {
  const root = fixture()
  const fake = setup(root)
  const first = await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const second = await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  assert.equal(second.round, first.round)

  const { root: gitRoot, run } = gitFixture()
  const gitFake = setup(gitRoot)
  await passDraft(gitFake, gitRoot, run)
  const applyFirst = await call(gitFake, 'openspec_review', {
    action: 'start', change: CHANGE, review: 'apply',
  })
  const applySecond = await call(gitFake, 'openspec_review', {
    action: 'start', change: CHANGE, review: 'apply',
  })
  assert.equal(applySecond.round, applyFirst.round)
})

test('apply start refuses an unknown base and a wrong round', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root, { draft: { enabled: false }, apply: { enabled: true } })
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' }),
    /base commit/,
  )
  run(['add', 'openspec/.gitignore'])
  run(['commit', '-m', 'add review ignore'])
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'start', change: CHANGE, review: 'apply', base: run(['rev-parse', 'HEAD']), round: 2,
    }),
    /next apply review round is 1/,
  )
})

test('apply status reads a recorded tree', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  const status = await call(fake, 'openspec_review', {
    action: 'status', change: CHANGE, review: 'apply',
  })
  assert.equal(status.state, 'in-review')
  assert.equal(status.treeSha, run(['rev-parse', 'HEAD^{tree}']))
})

test('start fails closed when a locked policy needs a reviewer but the service is absent', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const policyPath = join(reviewDir(root), 'policy.json')
  const policy = JSON.parse(readFileSync(policyPath, 'utf8'))
  policy.reviews.draft.reviewers = 1
  writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`)
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'start', change: CHANGE, intent: 'Add a theme selector.',
    }),
    /reviewer service is unavailable/,
  )
})

test('apply start fails closed when a locked policy needs a reviewer but the service is absent', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  const policyPath = join(reviewDir(root), 'policy.json')
  const policy = JSON.parse(readFileSync(policyPath, 'utf8'))
  policy.reviews.apply.reviewers = 1
  writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`)
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' }),
    /reviewer service is unavailable/,
  )
})

function externalSetup(root, reviews = { draft: { enabled: true, reviewers: 1 }, apply: { enabled: true, reviewers: 1 } }) {
  const activations = []
  const messages = []
  const subagents = {
    getProvider() {
      return { capabilities: { agentPreset: true, agentOptions: true } }
    },
    async startActivation(spec) {
      activations.push(spec)
      return { childId: `reviewer-${activations.length}` }
    },
    async sendMessage(sender, target, content) {
      messages.push({ sender, target, content })
    },
  }
  clearCache()
  const fake = createFakeContext({ cwd: root, subagents })
  apply(fake.ctx, { timeoutMs: 30_000, reviews })
  return { fake, activations, messages }
}

test('an independent reviewer reads the brief, submits and unblocks apply', async () => {
  const root = fixture()
  const { fake, activations } = externalSetup(root)
  assert.equal(fake.tools.has('openspec_reviewer'), false)
  const started = await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  assert.equal(started.mode, 'reviewer')
  assert.equal(started.independent, true)
  assert.equal(activations.length, 1)
  assert.equal(activations[0].agentPreset, 'openspec-reviewer')

  const reviewer = createFakeContext({ cwd: root })
  reviewerApply(reviewer.ctx)
  const read = await reviewer.tools.get('openspec_reviewer').execute({
    action: 'read', target: 'brief', change: CHANGE, review: 'draft',
  }, { agent: { id: 'reviewer-1' }, signal: new AbortController().signal })
  assert.match(read.brief, /Draft review brief/)

  const submitted = await reviewer.tools.get('openspec_reviewer').execute({
    action: 'submit',
    change: CHANGE,
    review: 'draft',
    report: report(),
  }, { agent: { id: 'reviewer-1' }, signal: new AbortController().signal })
  assert.equal(submitted.ready, true)

  const waited = await call(fake, 'openspec_review', {
    action: 'wait', change: CHANGE, review: 'draft',
  })
  assert.equal(waited.ready, true)
  await call(fake, 'openspec_apply_next', { change: CHANGE })
})

test('a reviewer report from another agent is refused', async () => {
  const root = fixture()
  const { fake } = externalSetup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const reviewer = createFakeContext({ cwd: root })
  reviewerApply(reviewer.ctx)
  await assert.rejects(
    reviewer.tools.get('openspec_reviewer').execute({
      action: 'submit', change: CHANGE, review: 'draft', report: report(),
    }, { agent: { id: 'someone-else' }, signal: new AbortController().signal }),
    /not the reviewer/,
  )
})

test('retry, replace and waive-reviewer handle a missing reviewer report', async () => {
  const root = fixture()
  const { fake, activations, messages } = externalSetup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', { action: 'retry', change: CHANGE, review: 'draft' })
  assert.equal(messages.length, 1)
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'retry', change: CHANGE, review: 'draft' }),
    /already retried/,
  )
  await call(fake, 'openspec_review', {
    action: 'replace', change: CHANGE, review: 'draft', reason: 'stuck',
  })
  assert.equal(activations.length, 2)
  const waived = await call(fake, 'openspec_review', {
    action: 'waive-reviewer',
    change: CHANGE,
    review: 'draft',
    waiver: 'accepted by the user',
    approvedBy: 'user',
  })
  assert.equal(waived.ready, true)
  assert.equal(waived.coverageGap, true)
})

test('the reviewer reads its report and status and refuses a duplicate submit', async () => {
  const root = fixture()
  const { fake } = externalSetup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const reviewer = createFakeContext({ cwd: root })
  reviewerApply(reviewer.ctx)
  const execute = (args) => reviewer.tools.get('openspec_reviewer').execute(args, {
    agent: { id: 'reviewer-1' }, signal: new AbortController().signal,
  })
  const status = await execute({ action: 'status', change: CHANGE, review: 'draft' })
  assert.equal(status.state, 'in-review')
  await execute({ action: 'submit', change: CHANGE, review: 'draft', report: report() })
  const own = await execute({ action: 'read', target: 'own-report', change: CHANGE, review: 'draft' })
  assert.equal(own.report.verdict, 'pass')
  await assert.rejects(
    execute({ action: 'submit', change: CHANGE, review: 'draft', report: report() }),
    /already has a report/,
  )
  await assert.rejects(
    execute({ action: 'submit', change: CHANGE, review: 'draft', round: 2, report: report() }),
    /current draft round is 1/,
  )
})

test('the reviewer refuses a missing record, a missing slot and a changed object', async () => {
  const root = fixture()
  const reviewer = createFakeContext({ cwd: root })
  reviewerApply(reviewer.ctx)
  const execute = (args) => reviewer.tools.get('openspec_reviewer').execute(args, {
    agent: { id: 'reviewer-1' }, signal: new AbortController().signal,
  })
  await assert.rejects(execute({ action: 'status', change: CHANGE, review: 'draft' }), /no draft review/)

  const self = setup(root)
  await call(self, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await assert.rejects(execute({ action: 'status', change: CHANGE, review: 'draft' }), /no reviewer slot/)

  const externalRoot = fixture()
  const external = externalSetup(externalRoot)
  await call(external.fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const externalReviewer = createFakeContext({ cwd: externalRoot })
  reviewerApply(externalReviewer.ctx)
  writeFileSync(join(externalRoot, 'openspec', 'changes', CHANGE, 'tasks.md'), '\n## 1. New\n\n- [ ] 1.1 New task\n')
  await assert.rejects(
    externalReviewer.tools.get('openspec_reviewer').execute({
      action: 'submit', change: CHANGE, review: 'draft', report: report(),
    }, { agent: { id: 'reviewer-1' }, signal: new AbortController().signal }),
    /object changed/,
  )
})

test('wait can time out and can return after a later submission', async () => {
  const root = fixture()
  const { fake } = externalSetup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const directory = reviewDir(root)
  const record = JSON.parse(readFileSync(join(directory, 'review.json'), 'utf8'))
  record.rounds[0].startedAt = new Date(Date.now() - 10 * 60_000).toISOString()
  record.limits.waitMinutes = 1
  writeFileSync(join(directory, 'review.json'), `${JSON.stringify(record, null, 2)}\n`)
  const overdue = await call(fake, 'openspec_review', {
    action: 'wait', change: CHANGE, review: 'draft',
  })
  assert.match(overdue.reasons.join(' '), /did not submit/)

  const secondRoot = fixture()
  const second = externalSetup(secondRoot)
  await call(second.fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const reviewer = createFakeContext({ cwd: secondRoot })
  reviewerApply(reviewer.ctx)
  const waiting = call(second.fake, 'openspec_review', {
    action: 'wait', change: CHANGE, review: 'draft',
  })
  await new Promise((resolve) => setTimeout(resolve, 350))
  await reviewer.tools.get('openspec_reviewer').execute({
    action: 'submit', change: CHANGE, review: 'draft', report: report(),
  }, { agent: { id: 'reviewer-1' }, signal: new AbortController().signal })
  const ready = await waiting
  assert.equal(ready.ready, true)
})

test('replace and waive-reviewer validate their preconditions', async () => {
  const root = fixture()
  const { fake } = externalSetup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'replace', change: CHANGE, review: 'draft' }),
    /needs a reason/,
  )
  await call(fake, 'openspec_review', {
    action: 'replace', change: CHANGE, review: 'draft', reason: 'stuck',
  })
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'replace', change: CHANGE, review: 'draft', reason: 'again',
    }),
    /already replaced/,
  )
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'waive-reviewer', change: CHANGE, review: 'draft', waiver: 'ok',
    }),
    /approvedBy user/,
  )
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'waive-reviewer', change: CHANGE, review: 'draft', approvedBy: 'user',
    }),
    /waiver text/,
  )
})

test('an independent apply reviewer submits a tree report', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  const policyPath = join(reviewDir(root), 'policy.json')
  const policy = JSON.parse(readFileSync(policyPath, 'utf8'))
  policy.reviews.apply.reviewers = 1
  writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`)
  const external = externalSetup(root)
  await call(external.fake, 'openspec_review', {
    action: 'start', change: CHANGE, review: 'apply',
  })
  assert.equal(external.activations.length, 1)
  const reviewer = createFakeContext({ cwd: root })
  reviewerApply(reviewer.ctx)
  const submitted = await reviewer.tools.get('openspec_reviewer').execute({
    action: 'submit', change: CHANGE, review: 'apply', report: report(),
  }, { agent: { id: 'reviewer-1' }, signal: new AbortController().signal })
  assert.equal(submitted.ready, true)
  const waited = await call(external.fake, 'openspec_review', {
    action: 'wait', change: CHANGE, review: 'apply',
  })
  assert.equal(waited.ready, true)
})

test('the reviewer reads a status target and refuses an own report before submission', async () => {
  const root = fixture()
  const { fake } = externalSetup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const reviewer = createFakeContext({ cwd: root })
  reviewerApply(reviewer.ctx)
  const execute = (args) => reviewer.tools.get('openspec_reviewer').execute(args, {
    agent: { id: 'reviewer-1' }, signal: new AbortController().signal,
  })
  const statusTarget = await execute({ action: 'read', target: 'status', change: CHANGE, review: 'draft' })
  assert.equal(statusTarget.state, 'in-review')
  const defaultTarget = await execute({ action: 'read', change: CHANGE, review: 'draft' })
  assert.match(defaultTarget.brief, /Draft review brief/)
  await assert.rejects(
    execute({ action: 'read', target: 'own-report', change: CHANGE, review: 'draft' }),
    /no report/,
  )
})

test('the reviewer tool rejects an unknown review kind', async () => {
  const root = fixture()
  const reviewer = createFakeContext({ cwd: root })
  reviewerApply(reviewer.ctx)
  await assert.rejects(
    reviewer.tools.get('openspec_reviewer').execute({
      action: 'status', change: CHANGE, review: 'other',
    }, { agent: { id: 'reviewer-1' }, signal: new AbortController().signal }),
    /review must be draft or apply/,
  )
})

test('a provider without agent preset support refuses the reviewer', async () => {
  const root = fixture()
  const subagents = {
    getProvider() {
      return { capabilities: { agentPreset: false, agentOptions: true } }
    },
    async startActivation() {
      throw new Error('must not start')
    },
  }
  clearCache()
  const fake = createFakeContext({ cwd: root, subagents })
  apply(fake.ctx, {
    timeoutMs: 30_000,
    reviews: { draft: { enabled: true, reviewers: 1 } },
  })
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'start', change: CHANGE, intent: 'Add a theme selector.',
    }),
    /does not support/,
  )
})

test('the reviewer handles a missing brief, an empty round and a missing slot', async () => {
  const root = fixture()
  const { fake } = externalSetup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const reviewer = createFakeContext({ cwd: root })
  reviewerApply(reviewer.ctx)
  const execute = (args) => reviewer.tools.get('openspec_reviewer').execute(args, {
    agent: { id: 'reviewer-1' }, signal: new AbortController().signal,
  })
  rmSync(join(reviewDir(root), 'round-1', 'brief.md'))
  const missing = await execute({ action: 'read', target: 'brief', change: CHANGE, review: 'draft' })
  assert.equal(missing.brief, '')
  const noReview = await execute({ action: 'read', target: 'brief', change: CHANGE })
  assert.equal(noReview.brief, '')

  const manual = fixture()
  mkdirSync(reviewDir(manual), { recursive: true })
  writeFileSync(join(reviewDir(manual), 'review.json'), JSON.stringify({
    schemaVersion: 1, id: 'x', change: CHANGE, review: 'draft', state: 'in-review',
    mode: 'reviewer', independent: true, objectHash: 'hash', rounds: [],
    findings: [], reviewers: { count: 1, slots: [{ slot: 1, agentId: 'reviewer-1' }] },
  }))
  const manualReviewer = createFakeContext({ cwd: manual })
  reviewerApply(manualReviewer.ctx)
  await assert.rejects(
    manualReviewer.tools.get('openspec_reviewer').execute({
      action: 'submit', change: CHANGE, review: 'draft', report: report(),
    }, { agent: { id: 'reviewer-1' }, signal: new AbortController().signal }),
    /has no round/,
  )
})

test('the reviewer refuses a record without a reviewer slot', async () => {
  const root = fixture()
  mkdirSync(reviewDir(root), { recursive: true })
  writeFileSync(join(reviewDir(root), 'review.json'), JSON.stringify({
    schemaVersion: 1, id: 'x', change: CHANGE, review: 'draft', state: 'in-review',
    mode: 'self', independent: false, objectHash: 'hash', rounds: [], findings: [],
  }))
  const reviewer = createFakeContext({ cwd: root })
  reviewerApply(reviewer.ctx)
  await assert.rejects(
    reviewer.tools.get('openspec_reviewer').execute({
      action: 'status', change: CHANGE, review: 'draft',
    }, { agent: { id: 'reviewer-1' }, signal: new AbortController().signal }),
    /no reviewer slot/,
  )
})

test('the reviewer refuses an apply record without a tree and a draft without intent', async () => {
  const root = fixture()
  mkdirSync(reviewDir(root), { recursive: true })
  writeFileSync(join(reviewDir(root), 'apply-review.json'), JSON.stringify({
    schemaVersion: 1, id: 'x', change: CHANGE, review: 'apply', state: 'in-review',
    mode: 'reviewer', independent: true, objectHash: 'hash', commitSha: 'missing',
    rounds: [{ round: 1, objectHash: 'hash', startedAt: new Date().toISOString() }],
    findings: [], reviewers: { count: 1, slots: [{ slot: 1, agentId: 'reviewer-1' }] },
  }))
  const reviewer = createFakeContext({ cwd: root })
  reviewerApply(reviewer.ctx)
  await assert.rejects(
    reviewer.tools.get('openspec_reviewer').execute({
      action: 'submit', change: CHANGE, review: 'apply', report: report(),
    }, { agent: { id: 'reviewer-1' }, signal: new AbortController().signal }),
    /HEAD could not be resolved/,
  )

  writeFileSync(join(reviewDir(root), 'review.json'), JSON.stringify({
    schemaVersion: 1, id: 'y', change: CHANGE, review: 'draft', state: 'in-review',
    mode: 'reviewer', independent: true, objectHash: 'hash',
    rounds: [{ round: 1, objectHash: 'hash', startedAt: new Date().toISOString() }],
    findings: [], reviewers: { count: 1, slots: [{ slot: 1, agentId: 'reviewer-1' }] },
  }))
  await assert.rejects(
    reviewer.tools.get('openspec_reviewer').execute({
      action: 'submit', change: CHANGE, review: 'draft', report: report(),
    }, { agent: { id: 'reviewer-1' }, signal: new AbortController().signal }),
    /intent file is missing/,
  )
})

test('wait returns a waiting segment result', async () => {
  const root = fixture()
  const { fake } = externalSetup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const realNow = Date.now
  try {
    let calls = 0
    Date.now = () => {
      calls += 1
      return calls === 1 ? realNow() : realNow() + 91_000
    }
    const waiting = await call(fake, 'openspec_review', {
      action: 'wait', change: CHANGE, review: 'draft',
    })
    assert.match(waiting.reasons.join(' '), /not submitted yet/)
  } finally {
    Date.now = realNow
  }
})

test('retry fails closed without a reviewer service', async () => {
  const root = fixture()
  clearCache()
  const fake = createFakeContext({ cwd: root })
  apply(fake.ctx, {
    timeoutMs: 30_000,
    reviews: { draft: { enabled: true, reviewers: 1 } },
  })
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'retry', change: CHANGE, review: 'draft' }),
    /reviewer service is unavailable/,
  )
})

test('the reviewer resolves a draft record without a change root', async () => {
  const root = fixture()
  const { fake } = externalSetup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const file = join(reviewDir(root), 'review.json')
  const record = JSON.parse(readFileSync(file, 'utf8'))
  delete record.changeRoot
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`)
  const reviewer = createFakeContext({ cwd: root })
  reviewerApply(reviewer.ctx)
  const submitted = await reviewer.tools.get('openspec_reviewer').execute({
    action: 'submit', change: CHANGE, review: 'draft', report: report(),
  }, { agent: { id: 'reviewer-1' }, signal: new AbortController().signal })
  assert.equal(submitted.ready, true)
  assert.equal(submitted.round, 1)
})

test('the reviewer refuses to read a brief without a round', async () => {
  const root = fixture()
  mkdirSync(reviewDir(root), { recursive: true })
  writeFileSync(join(reviewDir(root), 'review.json'), JSON.stringify({
    schemaVersion: 1, id: 'x', change: CHANGE, review: 'draft', state: 'in-review',
    mode: 'reviewer', independent: true, objectHash: 'hash', rounds: [], findings: [],
    reviewers: { count: 1, slots: [{ slot: 1, agentId: 'reviewer-1' }] },
  }))
  const reviewer = createFakeContext({ cwd: root })
  reviewerApply(reviewer.ctx)
  await assert.rejects(
    reviewer.tools.get('openspec_reviewer').execute({
      action: 'read', target: 'brief', change: CHANGE, review: 'draft',
    }, { agent: { id: 'reviewer-1' }, signal: new AbortController().signal }),
    /has no brief/,
  )
})

test('a reviewer start without the changer agent fails closed', async () => {
  const root = fixture()
  const { fake } = externalSetup(root)
  await assert.rejects(
    fake.tools.get('openspec_review').execute({
      action: 'start', change: CHANGE, intent: 'Add a theme selector.',
    }, { agent: null, signal: new AbortController().signal }),
    /needs the changer agent/,
  )
})

test('a reviewer service without provider lookup still activates a reviewer', async () => {
  const root = fixture()
  const activations = []
  const subagents = {
    async startActivation(spec) {
      activations.push(spec)
      return { childId: 'reviewer-1' }
    },
  }
  clearCache()
  const fake = createFakeContext({ cwd: root, subagents })
  apply(fake.ctx, {
    timeoutMs: 30_000,
    reviews: { draft: { enabled: true, reviewers: 1 } },
  })
  const started = await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  assert.equal(started.mode, 'reviewer')
  assert.equal(activations.length, 1)
  assert.equal(activations[0].agentPreset, 'openspec-reviewer')
})

test('a reviewer activation without a child id fails closed', async () => {
  const root = fixture()
  const subagents = {
    getProvider() {
      return { capabilities: { agentPreset: true, agentOptions: true } }
    },
    async startActivation() {
      return {}
    },
  }
  clearCache()
  const fake = createFakeContext({ cwd: root, subagents })
  apply(fake.ctx, {
    timeoutMs: 30_000,
    reviews: { draft: { enabled: true, reviewers: 1 } },
  })
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'start', change: CHANGE, intent: 'Add a theme selector.',
    }),
    /returned no child id/,
  )
})

test('self-report refuses an independently reviewed change', async () => {
  const root = fixture()
  const { fake } = externalSetup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'self-report', change: CHANGE, report: report(),
    }),
    /independent reviewers use openspec_reviewer/,
  )
})

test('wait refuses a missing record and a self review', async () => {
  const emptyRoot = fixture()
  const empty = setup(emptyRoot)
  await assert.rejects(
    call(empty, 'openspec_review', { action: 'wait', change: CHANGE, review: 'draft' }),
    /no draft review is recorded/,
  )

  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'wait', change: CHANGE, review: 'draft' }),
    /only available for an independent reviewer/,
  )
})

test('wait fails closed when the review record disappears', async () => {
  const root = fixture()
  const { fake } = externalSetup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const pending = call(fake, 'openspec_review', { action: 'wait', change: CHANGE, review: 'draft' })
  await new Promise((resolve) => setTimeout(resolve, 1_500))
  rmSync(join(reviewDir(root), 'review.json'))
  await assert.rejects(pending, /no draft review is recorded/)
})

test('wait reports cancellation before any deadline', async () => {
  const root = fixture()
  mkdirSync(reviewDir(root), { recursive: true })
  writeFileSync(join(reviewDir(root), 'review.json'), JSON.stringify({
    schemaVersion: 1, id: 'x', change: CHANGE, review: 'draft', state: 'in-review',
    mode: 'reviewer', independent: true, objectHash: 'hash', rounds: [], findings: [],
    reviewers: { count: 1, slots: [{ slot: 1, agentId: 'reviewer-1' }] },
  }))
  const fake = setup(root)
  const controller = new AbortController()
  const pending = fake.tools.get('openspec_review').execute({
    action: 'wait', change: CHANGE, review: 'draft',
  }, { agent: { id: 'review-test' }, signal: controller.signal })
  pending.catch(() => {})
  await new Promise((resolve) => setTimeout(resolve, 2_000))
  controller.abort()
  await assert.rejects(pending, /wait was cancelled/)
})

test('a draft start activates a reviewer when the record has no slots', async () => {
  const root = fixture()
  const { fake, activations } = externalSetup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  assert.equal(activations.length, 1)
  const file = join(reviewDir(root), 'review.json')
  const record = JSON.parse(readFileSync(file, 'utf8'))
  delete record.reviewers
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`)
  const restarted = await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  assert.equal(restarted.mode, 'reviewer')
  assert.equal(activations.length, 2)
  const saved = JSON.parse(readFileSync(file, 'utf8'))
  assert.equal(saved.reviewers.slots[0].agentId, 'reviewer-2')
})

test('an apply start activates a reviewer when the record has no slots', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  const policyPath = join(reviewDir(root), 'policy.json')
  const policy = JSON.parse(readFileSync(policyPath, 'utf8'))
  policy.reviews.apply.reviewers = 1
  writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`)
  const external = externalSetup(root)
  await call(external.fake, 'openspec_review', {
    action: 'start', change: CHANGE, review: 'apply',
  })
  assert.equal(external.activations.length, 1)
  const file = join(reviewDir(root), 'apply-review.json')
  const record = JSON.parse(readFileSync(file, 'utf8'))
  delete record.reviewers
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`)
  await call(external.fake, 'openspec_review', {
    action: 'start', change: CHANGE, review: 'apply',
  })
  assert.equal(external.activations.length, 2)
  const saved = JSON.parse(readFileSync(file, 'utf8'))
  assert.equal(saved.reviewers.slots[0].agentId, 'reviewer-2')
  assert.equal(saved.state, 'in-review')
})

test('retry refuses a self review and a record without a reviewer slot', async () => {
  const root = fixture()
  const messages = []
  const subagents = {
    async sendMessage(sender, target, content) {
      messages.push({ sender, target, content })
    },
  }
  clearCache()
  const selfFake = createFakeContext({ cwd: root, subagents })
  apply(selfFake.ctx, {
    timeoutMs: 30_000,
    reviews: { draft: { enabled: true, reviewers: 0 } },
  })
  await call(selfFake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await assert.rejects(
    call(selfFake, 'openspec_review', { action: 'retry', change: CHANGE, review: 'draft' }),
    /only available for an independent reviewer/,
  )
  assert.equal(messages.length, 0)

  const manual = fixture()
  mkdirSync(reviewDir(manual), { recursive: true })
  writeFileSync(join(reviewDir(manual), 'review.json'), JSON.stringify({
    schemaVersion: 1, id: 'x', change: CHANGE, review: 'draft', state: 'in-review',
    mode: 'reviewer', independent: true, objectHash: 'hash', rounds: [], findings: [],
    reviewers: { count: 1, slots: [] },
  }))
  const manualFake = createFakeContext({ cwd: manual, subagents })
  apply(manualFake.ctx, {
    timeoutMs: 30_000,
    reviews: { draft: { enabled: true, reviewers: 1 } },
  })
  await assert.rejects(
    call(manualFake, 'openspec_review', { action: 'retry', change: CHANGE, review: 'draft' }),
    /no reviewer slot/,
  )
  assert.equal(messages.length, 0)
})

test('replace refuses a self review and a record without a reviewer slot', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'replace', change: CHANGE, review: 'draft', reason: 'stuck',
    }),
    /only available for an independent reviewer/,
  )

  const manual = fixture()
  mkdirSync(reviewDir(manual), { recursive: true })
  writeFileSync(join(reviewDir(manual), 'review.json'), JSON.stringify({
    schemaVersion: 1, id: 'x', change: CHANGE, review: 'draft', state: 'in-review',
    mode: 'reviewer', independent: true, objectHash: 'hash', rounds: [], findings: [],
    reviewers: { count: 1, slots: [] },
  }))
  const manualFake = setup(manual)
  await assert.rejects(
    call(manualFake, 'openspec_review', {
      action: 'replace', change: CHANGE, review: 'draft', reason: 'stuck',
    }),
    /no reviewer slot/,
  )
})

test('waive-reviewer refuses a self review and a submitted report', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'waive-reviewer', change: CHANGE, review: 'draft',
      waiver: 'accepted', approvedBy: 'user',
    }),
    /only available for an independent reviewer/,
  )

  const submittedRoot = fixture()
  const external = externalSetup(submittedRoot)
  await call(external.fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const reviewer = createFakeContext({ cwd: submittedRoot })
  reviewerApply(reviewer.ctx)
  await reviewer.tools.get('openspec_reviewer').execute({
    action: 'submit', change: CHANGE, review: 'draft', report: report(),
  }, { agent: { id: 'reviewer-1' }, signal: new AbortController().signal })
  await assert.rejects(
    call(external.fake, 'openspec_review', {
      action: 'waive-reviewer', change: CHANGE, review: 'draft',
      waiver: 'accepted', approvedBy: 'user',
    }),
    /already submitted a report/,
  )
})

test('waive-reviewer records a reason and leaves an unready review in review', async () => {
  const root = fixture()
  const { fake } = externalSetup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const file = join(reviewDir(root), 'review.json')
  const record = JSON.parse(readFileSync(file, 'utf8'))
  record.findings = [{ ...majorFinding(), status: 'open', firstRound: 1 }]
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`)
  const waived = await call(fake, 'openspec_review', {
    action: 'waive-reviewer', change: CHANGE, review: 'draft',
    waiver: 'accepted', approvedBy: 'user', reason: 'reviewer unavailable',
  })
  assert.equal(waived.coverageGap, true)
  assert.equal(waived.ready, false)
  assert.equal(waived.state, 'in-review')
  const saved = JSON.parse(readFileSync(file, 'utf8'))
  assert.equal(saved.reviewerWaived.reason, 'reviewer unavailable')
  assert.equal(saved.state, 'in-review')
})

test('the reviewer preset is read-only and exported as a subpath', () => {
  const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  assert.match(patch, /id: preset-openspec-reviewer/)
  assert.match(patch, /id: openspec-reviewer/)
  assert.match(patch, /read: true/)
  assert.match(patch, /write: false/)
  assert.match(patch, /edit: false/)
  assert.doesNotMatch(patch, /dsh-tool-bash/)
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(manifest.exports['./reviewer'], './reviewer.js')
  assert.ok(manifest.files.includes('reviewer.js'))
})
