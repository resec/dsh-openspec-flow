import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { apply } from '../index.js'
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

test('start refuses an independent reviewer in a locked policy', async () => {
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
    /independent reviewers/,
  )
})

test('apply start refuses an independent reviewer in a locked policy', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  const policyPath = join(reviewDir(root), 'policy.json')
  const policy = JSON.parse(readFileSync(policyPath, 'utf8'))
  policy.reviews.apply.reviewers = 1
  writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`)
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' }),
    /independent reviewers/,
  )
})
