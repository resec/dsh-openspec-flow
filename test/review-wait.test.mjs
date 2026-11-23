import assert from 'node:assert/strict'
import {
  mkdirSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { apply as reviewerApply } from '../reviewer.js'
import { apply } from '../index.js'
import { clearReviewDeadlines, pendingDeadline } from '../lib/review/wakeup.js'
import { createFakeContext } from './fake-context.mjs'
import { readApplyState } from '../lib/worktree/state.js'
import {
  CHANGE, fixture, setup, call, reviewDir, report, majorFinding, gitFixture, passDraft, externalSetup, cleanupFixtures,
} from './review-fixtures.mjs'

test.after(cleanupFixtures)
test.after(() => clearReviewDeadlines())

/**
 * Wait until a predicate holds or the timeout expires.
 * @param predicate - condition to check.
 * @param timeoutMs - maximum wait.
 * @returns whether the predicate held.
 */
async function waitFor(predicate, timeoutMs = 3000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return true
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  return predicate()
}

test('wait returns overdue at the deadline', async () => {
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
  assert.equal(overdue.waitState, 'overdue')
  assert.match(overdue.reasons.join(' '), /did not submit/)
})

test('wait returns ready after a submission', async () => {
  const root = fixture()
  const { fake } = externalSetup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const reviewer = createFakeContext({ cwd: root })
  reviewerApply(reviewer.ctx)
  await reviewer.tools.get('openspec_reviewer').execute({
    action: 'submit', change: CHANGE, review: 'draft', report: report(),
  }, { agent: { id: 'reviewer-1' }, signal: new AbortController().signal })
  const ready = await call(fake, 'openspec_review', {
    action: 'wait', change: CHANGE, review: 'draft',
  })
  assert.equal(ready.ready, true)
  assert.equal(ready.waitState, 'ready')
})

test('wait returns waiting without blocking', async () => {
  const root = fixture()
  const { fake } = externalSetup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const controller = new AbortController()
  const pending = fake.tools.get('openspec_review').execute({
    action: 'wait', change: CHANGE, review: 'draft',
  }, { agent: { id: 'review-test' }, signal: controller.signal })
  pending.catch(() => {})
  let timer
  try {
    const waiting = await Promise.race([
      pending,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('wait blocked instead of returning waiting')), 1500)
      }),
    ])
    assert.equal(waiting.waitState, 'waiting')
    assert.match(waiting.reasons.join(' '), /end the turn|not submitted/)
  } finally {
    clearTimeout(timer)
    controller.abort()
  }
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
    action: 'resume', change: CHANGE,
  })
  assert.equal(restarted.mode, 'reviewer')
  assert.equal(activations.length, 2)
  const saved = JSON.parse(readFileSync(file, 'utf8'))
  assert.equal(saved.reviewers.slots[0].agentId, 'reviewer-2')
})

test('a new draft round wakes the same reviewer and resumes do not', async () => {
  const root = fixture()
  const { fake, activations, messages } = externalSetup(root)
  const intent = 'Add a theme selector.'
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent })
  assert.equal(activations.length, 1)

  const reviewer = createFakeContext({ cwd: root })
  reviewerApply(reviewer.ctx)
  const execute = (args) => reviewer.tools.get('openspec_reviewer').execute(args, {
    agent: { id: 'reviewer-1' },
    signal: new AbortController().signal,
  })
  const submitted = await execute({
    action: 'submit',
    change: CHANGE,
    review: 'draft',
    report: report({ verdict: 'changes-requested', findings: [majorFinding()] }),
  })
  assert.equal(submitted.round, 1)
  await call(fake, 'openspec_review', {
    action: 'dispose',
    change: CHANGE,
    review: 'draft',
    id: 'R1-01',
    status: 'fixed',
    note: 'Round 2 resolves it.',
  })

  const second = await call(fake, 'openspec_review', { action: 'resume', change: CHANGE })
  assert.equal(second.round, 2)
  assert.equal(activations.length, 1)
  assert.equal(messages.length, 1)
  assert.equal(messages[0].target, 'reviewer-1')
  assert.match(messages[0].content[0].text, /new draft review round 2/)

  const record = JSON.parse(readFileSync(join(reviewDir(root), 'review.json'), 'utf8'))
  const slot = record.reviewers.slots[0]
  assert.equal(slot.agentId, 'reviewer-1')
  assert.equal(slot.round, 2)
  assert.equal(slot.replacements, undefined)
  assert.equal(slot.retries, undefined)
  assert.equal(typeof slot.lastWokenAt, 'string')

  const resumed = await call(fake, 'openspec_review', { action: 'resume', change: CHANGE })
  assert.equal(resumed.round, 2)
  assert.equal(activations.length, 1)
  assert.equal(messages.length, 1)

  const roundTwo = await execute({
    action: 'submit',
    change: CHANGE,
    review: 'draft',
    report: report({
      verifications: [{ id: 'R1-01', status: 'verified-fixed', evidence: 'The round 2 report resolves it.' }],
    }),
  })
  assert.equal(roundTwo.round, 2)
})

test('a new-round wake fails closed without the reviewer service or the changer agent', async () => {
  const root = fixture()
  const { fake } = externalSetup(root)
  const intent = 'Add a theme selector.'
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent })
  const reviewer = createFakeContext({ cwd: root })
  reviewerApply(reviewer.ctx)
  await reviewer.tools.get('openspec_reviewer').execute({
    action: 'submit',
    change: CHANGE,
    review: 'draft',
    report: report({ verdict: 'changes-requested', findings: [majorFinding()] }),
  }, { agent: { id: 'reviewer-1' }, signal: new AbortController().signal })
  await call(fake, 'openspec_review', {
    action: 'dispose', review: 'draft', change: CHANGE, id: 'R1-01', status: 'fixed', note: 'Fixed.',
  })

  const noService = createFakeContext({ cwd: root, subagents: {} })
  apply(noService.ctx, {
    timeoutMs: 30_000,
    reviews: { draft: { enabled: true, reviewers: 1 } },
  })
  await assert.rejects(
    noService.tools.get('openspec_review').execute(
      { action: 'resume', change: CHANGE },
      { agent: { id: 'changer' }, signal: new AbortController().signal },
    ),
    /reviewer service is unavailable/,
  )

  const noParent = createFakeContext({ cwd: root, subagents: { async sendMessage() {} } })
  apply(noParent.ctx, {
    timeoutMs: 30_000,
    reviews: { draft: { enabled: true, reviewers: 1 } },
  })
  await assert.rejects(
    noParent.tools.get('openspec_review').execute(
      { action: 'resume', change: CHANGE },
      { agent: null, signal: new AbortController().signal },
    ),
    /needs the changer agent/,
  )
})

test('an open finding blocks a new round before any reviewer wake', async () => {
  const root = fixture()
  const { fake, messages } = externalSetup(root)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  const reviewer = createFakeContext({ cwd: root })
  reviewerApply(reviewer.ctx)
  await reviewer.tools.get('openspec_reviewer').execute({
    action: 'submit',
    change: CHANGE,
    review: 'draft',
    report: report({ verdict: 'changes-requested', findings: [majorFinding()] }),
  }, { agent: { id: 'reviewer-1' }, signal: new AbortController().signal })
  const before = messages.length
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'resume', change: CHANGE }),
    /still open: R1-01/,
  )
  assert.equal(messages.length, before)
  const record = JSON.parse(readFileSync(join(reviewDir(root), 'review.json'), 'utf8'))
  assert.equal(record.rounds.length, 1)
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
    action: 'resume', change: CHANGE, review: 'apply',
  })
  assert.equal(external.activations.length, 2)
  const saved = JSON.parse(readFileSync(file, 'utf8'))
  assert.equal(saved.reviewers.slots[0].agentId, 'reviewer-2')
  assert.equal(saved.state, 'in-review')
})

test('a new apply round wakes the same reviewer and resumes do not', async () => {
  const { root, run } = gitFixture()
  const { fake, activations, messages } = externalSetup(root, {
    draft: { enabled: true, reviewers: 0 },
    apply: { enabled: true, reviewers: 1 },
  })
  await passDraft(fake, root, run)
  const first = await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  assert.equal(first.round, 1)
  assert.equal(activations.length, 1)

  const reviewer = createFakeContext({ cwd: readApplyState(root, null, CHANGE).worktree })
  reviewerApply(reviewer.ctx)
  const execute = (args) => reviewer.tools.get('openspec_reviewer').execute(args, {
    agent: { id: 'reviewer-1' },
    signal: new AbortController().signal,
  })
  const submitted = await execute({
    action: 'submit',
    change: CHANGE,
    review: 'apply',
    report: report({ verdict: 'changes-requested', findings: [majorFinding()] }),
  })
  assert.equal(submitted.round, 1)
  await call(fake, 'openspec_review', {
    action: 'dispose',
    change: CHANGE,
    review: 'apply',
    id: 'R1-01',
    status: 'fixed',
    note: 'Round 2 resolves it.',
  })

  const second = await call(fake, 'openspec_review', { action: 'resume', change: CHANGE, review: 'apply' })
  assert.equal(second.round, 2)
  assert.equal(activations.length, 1)
  assert.equal(messages.length, 1)
  assert.equal(messages[0].target, 'reviewer-1')
  assert.match(messages[0].content[0].text, /new apply review round 2/)

  const record = JSON.parse(readFileSync(join(reviewDir(root), 'apply-review.json'), 'utf8'))
  const slot = record.reviewers.slots[0]
  assert.equal(slot.agentId, 'reviewer-1')
  assert.equal(slot.round, 2)
  assert.equal(slot.replacements, undefined)
  assert.equal(typeof slot.lastWokenAt, 'string')

  const resumed = await call(fake, 'openspec_review', { action: 'resume', change: CHANGE, review: 'apply' })
  assert.equal(resumed.round, 2)
  assert.equal(activations.length, 1)
  assert.equal(messages.length, 1)

  const roundTwo = await execute({
    action: 'submit',
    change: CHANGE,
    review: 'apply',
    report: report({
      verifications: [{ id: 'R1-01', status: 'verified-fixed', evidence: 'The round 2 report resolves it.' }],
    }),
  })
  assert.equal(roundTwo.round, 2)
})

test('start refuses a recorded review and resume refuses an unstarted one', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  const intentPath = join(reviewDir(root), 'intent.md')
  const before = readFileSync(intentPath)
  const recorded = JSON.parse(readFileSync(join(reviewDir(root), 'review.json'), 'utf8'))
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'A different goal.' }),
    /the draft review already started; run openspec_review action=resume review=draft/,
  )
  assert.deepEqual(readFileSync(intentPath), before)
  assert.equal(JSON.parse(readFileSync(join(reviewDir(root), 'review.json'), 'utf8')).intent.sha256, recorded.intent.sha256)
  const other = fixture()
  const otherFake = setup(other)
  await assert.rejects(
    call(otherFake, 'openspec_review', { action: 'resume', change: CHANGE }),
    /the draft review has not started; run openspec_review action=start review=draft/,
  )
})

test('apply start and resume refuse the other round entry', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' }),
    /the apply review already started; run openspec_review action=resume review=apply/,
  )
  const other = gitFixture()
  const otherFake = setup(other.root)
  await passDraft(otherFake, other.root, other.run)
  await assert.rejects(
    call(otherFake, 'openspec_review', { action: 'resume', change: CHANGE, review: 'apply' }),
    /the apply review has not started; run openspec_review action=start review=apply/,
  )
})

test('resume refuses an intent and leaves the recorded intent unchanged', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  const intentPath = join(reviewDir(root), 'intent.md')
  const before = readFileSync(intentPath)
  const recorded = JSON.parse(readFileSync(join(reviewDir(root), 'review.json'), 'utf8'))
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'resume', change: CHANGE, intent: 'A different goal.' }),
    /resume takes no intent/,
  )
  await call(fake, 'openspec_review', { action: 'resume', change: CHANGE })
  assert.deepEqual(readFileSync(intentPath), before)
  const after = JSON.parse(readFileSync(join(reviewDir(root), 'review.json'), 'utf8'))
  assert.equal(after.intent.sha256, recorded.intent.sha256)
  assert.equal(after.rounds.length, 1)
})

test('resume refuses an intent file edited after the review started', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  writeFileSync(join(reviewDir(root), 'intent.md'), 'A rewritten goal.\n')
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'resume', change: CHANGE }),
    /intent file changed after the review started; remove the review record/,
  )
})

test('resume refuses a record whose policy file is missing', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  rmSync(join(reviewDir(root), 'policy.json'))
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'resume', change: CHANGE }),
    /draft review policy is missing; remove the review record/,
  )
})

test('status names resume with the review kind after a fixed finding', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  await call(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE,
    report: report({ verdict: 'changes-requested', findings: [majorFinding()] }),
  })
  await call(fake, 'openspec_review', {
    action: 'dispose', review: 'draft', change: CHANGE, id: 'R1-01', status: 'fixed', note: 'Added the task.',
  })
  const status = await call(fake, 'openspec_review', { action: 'status', change: CHANGE })
  assert.equal(status.nextAction, 'openspec_review action=resume review=draft')
})

test('resume refuses a missing intent file', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  rmSync(join(reviewDir(root), 'intent.md'))
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'resume', change: CHANGE }),
    /intent file is missing; remove the review record/,
  )
})

test('a reviewer submit steers an idle changer', async () => {
  const root = fixture()
  const changer = {
    id: 'review-test',
    status: 'idle',
    steered: [],
    steer(message) {
      this.steered.push(message)
    },
  }
  const { fake, steered, subagents } = externalSetup(root, undefined, {
    seedAgents: [changer],
    deliverSteer: true,
  })
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const reviewer = createFakeContext({ cwd: root, subagents })
  reviewerApply(reviewer.ctx)
  await reviewer.tools.get('openspec_reviewer').execute({
    action: 'submit', change: CHANGE, review: 'draft', report: report(),
  }, { agent: { id: 'reviewer-1' }, signal: new AbortController().signal })
  assert.equal(steered.length, 1)
  assert.equal(steered[0].target, 'review-test')
  assert.equal(changer.steered.length, 1)
  assert.match(changer.steered[0].content[0].text, /submitted/i)
})

test('wait declares waitState and returns only schema keys', async () => {
  const root = fixture()
  const { fake } = externalSetup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const tool = fake.tools.get('openspec_review')
  assert.equal(tool.output.schema.properties.waitState.type, 'string')
  assert.deepEqual(tool.output.schema.properties.waitState.enum, ['waiting', 'ready', 'overdue'])
  const waiting = await call(fake, 'openspec_review', {
    action: 'wait', change: CHANGE, review: 'draft',
  })
  for (const key of Object.keys(waiting)) {
    assert.ok(
      Object.hasOwn(tool.output.schema.properties, key),
      `wait returned an undeclared key: ${key}`,
    )
  }
})

test('wait records the latest caller', async () => {
  const root = fixture()
  const { fake } = externalSetup(root)
  const tool = fake.tools.get('openspec_review')
  const run = (args, agent) => tool.execute(args, { agent, signal: new AbortController().signal })
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const file = join(reviewDir(root), 'review.json')
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).changerSessionId, 'review-test')
  await run({ action: 'resume', change: CHANGE }, { id: 'other-session' })
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).changerSessionId, 'other-session')
  await run({ action: 'wait', change: CHANGE, review: 'draft' }, { id: 'third-session' })
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).changerSessionId, 'third-session')
})

test('a held review lock still wakes the waiting caller', async () => {
  const root = fixture()
  const old = {
    id: 'review-test',
    status: 'idle',
    steered: [],
    steer(message) {
      this.steered.push(message)
    },
  }
  const waiter = {
    id: 'third-session',
    status: 'idle',
    steered: [],
    steer(message) {
      this.steered.push(message)
    },
  }
  const { fake, steered, subagents } = externalSetup(root, undefined, {
    seedAgents: [old, waiter],
    deliverSteer: true,
  })
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const lock = join(reviewDir(root), '.lock')
  mkdirSync(lock)
  try {
    const waiting = await fake.tools.get('openspec_review').execute({
      action: 'wait', change: CHANGE, review: 'draft',
    }, { agent: { id: 'third-session' }, signal: new AbortController().signal })
    assert.equal(waiting.waitState, 'waiting')
    assert.match(fake.warnings.join(' '), /could not record the changer session/)
    assert.equal(pendingDeadline(reviewDir(root), 'draft').changerSessionId, 'third-session')
  } finally {
    rmSync(lock, { recursive: true, force: true })
  }
  const reviewer = createFakeContext({ cwd: root, subagents })
  reviewerApply(reviewer.ctx)
  await reviewer.tools.get('openspec_reviewer').execute({
    action: 'submit', change: CHANGE, review: 'draft', report: report(),
  }, { agent: { id: 'reviewer-1' }, signal: new AbortController().signal })
  assert.equal(waiter.steered.length, 1)
  assert.equal(steered.some((entry) => entry.target === 'third-session'), true)
})

test('a legacy record wakes the reviewer parent session', async () => {
  const root = fixture()
  const legacy = {
    id: 'legacy-parent',
    status: 'idle',
    steered: [],
    steer(message) {
      this.steered.push(message)
    },
  }
  const { fake, steered, subagents } = externalSetup(root, undefined, {
    seedAgents: [legacy],
    deliverSteer: true,
  })
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const file = join(reviewDir(root), 'review.json')
  const record = JSON.parse(readFileSync(file, 'utf8'))
  delete record.changerSessionId
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`)
  const reviewer = createFakeContext({ cwd: root, subagents })
  reviewerApply(reviewer.ctx)
  await reviewer.tools.get('openspec_reviewer').execute({
    action: 'submit', change: CHANGE, review: 'draft', report: report(),
  }, {
    agent: { id: 'reviewer-1', session: { header: { parentSession: 'legacy-parent' } } },
    signal: new AbortController().signal,
  })
  assert.deepEqual(steered.map((entry) => entry.target), ['legacy-parent'])
})

test('a live waiter keeps the reviewer parent out of the target set', async () => {
  const root = fixture()
  const changer = {
    id: 'review-test',
    status: 'idle',
    steered: [],
    steer(message) {
      this.steered.push(message)
    },
  }
  const { fake, messages, subagents } = externalSetup(root, undefined, {
    seedAgents: [changer],
    deliverSteer: true,
  })
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', { action: 'wait', change: CHANGE, review: 'draft' })
  const reviewer = createFakeContext({ cwd: root, subagents })
  reviewerApply(reviewer.ctx)
  await reviewer.tools.get('openspec_reviewer').execute({
    action: 'submit', change: CHANGE, review: 'draft', report: report(),
  }, {
    agent: { id: 'reviewer-1', session: { header: { parentSession: 'other-parent' } } },
    signal: new AbortController().signal,
  })
  assert.deepEqual(messages.map((entry) => entry.target), ['review-test'])
  assert.equal(changer.steered.length, 1)
})

test('a review without a changer session logs and skips the wakeup', async () => {
  const root = fixture()
  const { fake, steered, subagents } = externalSetup(root, undefined, { deliverSteer: true })
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const file = join(reviewDir(root), 'review.json')
  const record = JSON.parse(readFileSync(file, 'utf8'))
  delete record.changerSessionId
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`)
  const reviewer = createFakeContext({ cwd: root, subagents })
  reviewerApply(reviewer.ctx)
  await reviewer.tools.get('openspec_reviewer').execute({
    action: 'submit', change: CHANGE, review: 'draft', report: report(),
  }, { agent: { id: 'reviewer-1' }, signal: new AbortController().signal })
  assert.equal(steered.length, 0)
  assert.match(reviewer.warnings.join(' '), /no changer session/)
})

test('a failed wakeup target does not skip the live waiter', async () => {
  const root = fixture()
  const changer = {
    id: 'review-test',
    status: 'idle',
    steered: [],
    steer(message) {
      this.steered.push(message)
    },
  }
  const { fake, steered, subagents } = externalSetup(root, undefined, {
    seedAgents: [changer],
    deliverSteer: true,
  })
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', { action: 'wait', change: CHANGE, review: 'draft' })
  const file = join(reviewDir(root), 'review.json')
  const record = JSON.parse(readFileSync(file, 'utf8'))
  record.changerSessionId = 'dead-session'
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`)
  const original = subagents.sendMessage.bind(subagents)
  subagents.sendMessage = async (sender, target, content, options) => {
    if (target === 'dead-session') throw new Error('dead target')
    return original(sender, target, content, options)
  }
  const reviewer = createFakeContext({ cwd: root, subagents })
  reviewerApply(reviewer.ctx)
  await reviewer.tools.get('openspec_reviewer').execute({
    action: 'submit', change: CHANGE, review: 'draft', report: report(),
  }, { agent: { id: 'reviewer-1' }, signal: new AbortController().signal })
  assert.equal(changer.steered.length, 1)
  assert.equal(steered.length, 1)
  assert.match(reviewer.warnings.join(' '), /wakeup to dead-session failed/)
})

test('a failed wakeup keeps the report', async () => {
  const root = fixture()
  const { fake, subagents } = externalSetup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  subagents.sendMessage = async () => {
    throw new Error('delivery refused')
  }
  const reviewer = createFakeContext({ cwd: root, subagents })
  reviewerApply(reviewer.ctx)
  await reviewer.tools.get('openspec_reviewer').execute({
    action: 'submit', change: CHANGE, review: 'draft', report: report(),
  }, { agent: { id: 'reviewer-1' }, signal: new AbortController().signal })
  const ready = await call(fake, 'openspec_review', {
    action: 'wait', change: CHANGE, review: 'draft',
  })
  assert.equal(ready.ready, true)
})

test('the wait deadline steers the waiter', async () => {
  const root = fixture()
  const changer = {
    id: 'review-test',
    status: 'idle',
    steered: [],
    steer(message) {
      this.steered.push(message)
    },
  }
  const reviewerAgent = { id: 'reviewer-1', status: 'idle' }
  const { fake, steered } = externalSetup(root, undefined, {
    seedAgents: [changer, reviewerAgent],
    deliverSteer: true,
  })
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const file = join(reviewDir(root), 'review.json')
  const record = JSON.parse(readFileSync(file, 'utf8'))
  record.rounds[0].startedAt = new Date(Date.now() - (10 * 60_000 - 2000)).toISOString()
  record.limits.waitMinutes = 10
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`)
  await call(fake, 'openspec_review', { action: 'wait', change: CHANGE, review: 'draft' })
  assert.ok(pendingDeadline(reviewDir(root), 'draft'))
  assert.equal(await waitFor(() => changer.steered.length === 1, 5000), true)
  assert.match(changer.steered[0].content[0].text, /wait limit/)
})

test('a submission cancels the deadline', async () => {
  const root = fixture()
  const changer = {
    id: 'review-test',
    status: 'idle',
    steered: [],
    steer(message) {
      this.steered.push(message)
    },
  }
  const reviewerAgent = { id: 'reviewer-1', status: 'idle' }
  const { fake, subagents } = externalSetup(root, undefined, {
    seedAgents: [changer, reviewerAgent],
    deliverSteer: true,
  })
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const file = join(reviewDir(root), 'review.json')
  const record = JSON.parse(readFileSync(file, 'utf8'))
  record.rounds[0].startedAt = new Date(Date.now() - (10 * 60_000 - 2000)).toISOString()
  record.limits.waitMinutes = 10
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`)
  await call(fake, 'openspec_review', { action: 'wait', change: CHANGE, review: 'draft' })
  const reviewer = createFakeContext({ cwd: root, subagents })
  reviewerApply(reviewer.ctx)
  await reviewer.tools.get('openspec_reviewer').execute({
    action: 'submit', change: CHANGE, review: 'draft', report: report(),
  }, { agent: { id: 'reviewer-1' }, signal: new AbortController().signal })
  assert.equal(await waitFor(() => changer.steered.length >= 1, 5000), true)
  await new Promise((resolve) => setTimeout(resolve, 600))
  assert.equal(changer.steered.length, 1)
  assert.doesNotMatch(changer.steered[0].content[0].text, /wait limit/)
})

test('a repeated wait replaces the deadline', async () => {
  const root = fixture()
  const changer = {
    id: 'review-test',
    status: 'idle',
    steered: [],
    steer(message) {
      this.steered.push(message)
    },
  }
  const reviewerAgent = { id: 'reviewer-1', status: 'idle' }
  const { fake } = externalSetup(root, undefined, {
    seedAgents: [changer, reviewerAgent],
    deliverSteer: true,
  })
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const file = join(reviewDir(root), 'review.json')
  const record = JSON.parse(readFileSync(file, 'utf8'))
  record.rounds[0].startedAt = new Date(Date.now() - (10 * 60_000 - 2000)).toISOString()
  record.limits.waitMinutes = 10
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`)
  await call(fake, 'openspec_review', { action: 'wait', change: CHANGE, review: 'draft' })
  await call(fake, 'openspec_review', { action: 'wait', change: CHANGE, review: 'draft' })
  assert.equal(await waitFor(() => changer.steered.length >= 1, 5000), true)
  await new Promise((resolve) => setTimeout(resolve, 600))
  assert.equal(changer.steered.length, 1)
})

test('the wait session write keeps a concurrent report', async () => {
  const root = fixture()
  const { fake } = externalSetup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const reviewer = createFakeContext({ cwd: root })
  reviewerApply(reviewer.ctx)
  const pending = call(fake, 'openspec_review', {
    action: 'wait', change: CHANGE, review: 'draft',
  })
  await new Promise((resolve) => setTimeout(resolve, 80))
  await reviewer.tools.get('openspec_reviewer').execute({
    action: 'submit', change: CHANGE, review: 'draft', report: report(),
  }, { agent: { id: 'reviewer-1' }, signal: new AbortController().signal })
  const result = await pending
  assert.ok(result.waitState === 'waiting' || result.waitState === 'ready')
  const record = JSON.parse(readFileSync(join(reviewDir(root), 'review.json'), 'utf8'))
  assert.ok(record.rounds.at(-1).report, 'the wait session write kept the report pointer')
})

test('the deadline skips when the reviewer is not live', async () => {
  const root = fixture()
  const changer = {
    id: 'review-test',
    status: 'idle',
    steered: [],
    steer(message) {
      this.steered.push(message)
    },
  }
  const { fake } = externalSetup(root, undefined, {
    seedAgents: [changer],
    deliverSteer: true,
  })
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const file = join(reviewDir(root), 'review.json')
  const record = JSON.parse(readFileSync(file, 'utf8'))
  record.rounds[0].startedAt = new Date(Date.now() - (10 * 60_000 - 2000)).toISOString()
  record.limits.waitMinutes = 10
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`)
  await call(fake, 'openspec_review', { action: 'wait', change: CHANGE, review: 'draft' })
  assert.equal(await waitFor(() => fake.warnings.join(' ').includes('reviewer is not live'), 5000), true)
  assert.equal(changer.steered.length, 0)
})

test('wait accepts a caller without an agent id', async () => {
  const root = fixture()
  const { fake } = externalSetup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const waiting = await fake.tools.get('openspec_review').execute({
    action: 'wait', change: CHANGE, review: 'draft',
  }, { signal: new AbortController().signal })
  assert.equal(waiting.waitState, 'waiting')
})

test('wait without a stored session records the caller', async () => {
  const root = fixture()
  const { fake } = externalSetup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const file = join(reviewDir(root), 'review.json')
  const record = JSON.parse(readFileSync(file, 'utf8'))
  delete record.changerSessionId
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`)
  const waiting = await fake.tools.get('openspec_review').execute({
    action: 'wait', change: CHANGE, review: 'draft',
  }, { agent: { id: 'third-session' }, signal: new AbortController().signal })
  assert.equal(waiting.waitState, 'waiting')
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).changerSessionId, 'third-session')
  assert.equal(pendingDeadline(reviewDir(root), 'draft').changerSessionId, 'third-session')
})

test('the plugin effect clears pending deadlines', async () => {
  const root = fixture()
  const { fake, disposers } = externalSetup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', { action: 'wait', change: CHANGE, review: 'draft' })
  assert.ok(pendingDeadline(reviewDir(root), 'draft'))
  const cleanup = disposers.at(-1)
  assert.equal(typeof cleanup, 'function')
  cleanup()
  assert.equal(pendingDeadline(reviewDir(root), 'draft'), undefined)
})

test('wait uses the default deadline and limit when the record omits them', async () => {
  const root = fixture()
  const { fake } = externalSetup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const file = join(reviewDir(root), 'review.json')
  const record = JSON.parse(readFileSync(file, 'utf8'))
  delete record.rounds[0].startedAt
  delete record.limits
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`)
  const waiting = await call(fake, 'openspec_review', {
    action: 'wait', change: CHANGE, review: 'draft',
  })
  assert.equal(waiting.waitState, 'waiting')
  assert.ok(pendingDeadline(reviewDir(root), 'draft'))
})

test('extend points back to wait', async () => {
  const root = fixture()
  const { fake } = externalSetup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const extended = await call(fake, 'openspec_review', {
    action: 'extend',
    change: CHANGE,
    approvedBy: 'user',
    reason: 'The reviewer needs more time.',
    minutes: 1,
  })
  assert.equal(extended.nextAction, 'openspec_review action=wait')
})

test('the deadline falls back to the reviewer parent session', async () => {
  const root = fixture()
  const reviewerAgent = {
    id: 'reviewer-1',
    status: 'idle',
    session: { header: { parentSession: 'fallback-parent' } },
  }
  const fallback = {
    id: 'fallback-parent',
    status: 'idle',
    steered: [],
    steer(message) {
      this.steered.push(message)
    },
  }
  const { fake } = externalSetup(root, undefined, {
    seedAgents: [reviewerAgent, fallback],
    deliverSteer: true,
  })
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const file = join(reviewDir(root), 'review.json')
  const record = JSON.parse(readFileSync(file, 'utf8'))
  delete record.changerSessionId
  record.rounds[0].startedAt = new Date(Date.now() - (10 * 60_000 - 2000)).toISOString()
  record.limits.waitMinutes = 10
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`)
  await fake.tools.get('openspec_review').execute({
    action: 'wait', change: CHANGE, review: 'draft',
  }, { signal: new AbortController().signal })
  assert.ok(pendingDeadline(reviewDir(root), 'draft'))
  assert.equal(await waitFor(() => fallback.steered.length === 1, 5000), true)
  assert.match(fallback.steered[0].content[0].text, /wait limit/)
})

/**
 * Write a minimal apply review record without running a reviewer.
 * @param root - fixture root.
 * @param record - the apply record to write.
 */
function writeApplyReview(root, record) {
  const directory = reviewDir(root)
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, 'apply-review.json'), `${JSON.stringify(record, null, 2)}\n`)
}

test('an apply wait reports archive when ready and a qualified overdue action', async () => {
  const readyRoot = fixture()
  const readyFake = setup(readyRoot)
  writeApplyReview(readyRoot, {
    schemaVersion: 1,
    id: 'apply-ready',
    change: CHANGE,
    review: 'apply',
    state: 'in-review',
    mode: 'reviewer',
    independent: true,
    objectHash: 'tree-hash',
    rounds: [{ round: 1, objectHash: 'tree-hash', startedAt: new Date().toISOString() }],
    findings: [],
    reviewers: { count: 1, slots: [{ slot: 1, agentId: 'reviewer-1' }] },
    reviewerWaived: {
      slot: 1, reason: null, waiver: 'user waiver', approvedBy: 'user', at: new Date().toISOString(),
    },
  })
  const ready = await call(readyFake, 'openspec_review', {
    action: 'wait', change: CHANGE, review: 'apply',
  })
  assert.equal(ready.waitState, 'ready')
  assert.equal(ready.nextAction, 'openspec_archive')

  const overdueRoot = fixture()
  const overdueFake = setup(overdueRoot)
  writeApplyReview(overdueRoot, {
    schemaVersion: 1,
    id: 'apply-overdue',
    change: CHANGE,
    review: 'apply',
    state: 'in-review',
    mode: 'reviewer',
    independent: true,
    objectHash: 'tree-hash',
    rounds: [{
      round: 1,
      objectHash: 'tree-hash',
      startedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
    }],
    findings: [],
    limits: { waitMinutes: 1, maxRounds: 5 },
    reviewers: { count: 1, slots: [{ slot: 1, agentId: 'reviewer-1' }] },
  })
  const overdue = await call(overdueFake, 'openspec_review', {
    action: 'wait', change: CHANGE, review: 'apply',
  })
  assert.equal(overdue.waitState, 'overdue')
  assert.match(overdue.nextAction, /review=apply/)
})

test('an apply not-ready submit wakes with the apply dispose action', async () => {
  const { root, run } = gitFixture()
  const changer = {
    id: 'review-test',
    status: 'idle',
    steered: [],
    steer(message) {
      this.steered.push(message)
    },
  }
  const { fake, steered, subagents } = externalSetup(root, {
    draft: { enabled: true, reviewers: 0 },
    apply: { enabled: true, reviewers: 1 },
  }, { seedAgents: [changer], deliverSteer: true })
  await passDraft(fake, root, run)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  const reviewer = createFakeContext({ cwd: readApplyState(root, null, CHANGE).worktree, subagents })
  reviewerApply(reviewer.ctx)
  await reviewer.tools.get('openspec_reviewer').execute({
    action: 'submit',
    change: CHANGE,
    review: 'apply',
    report: report({ verdict: 'changes-requested', findings: [majorFinding()] }),
  }, { agent: { id: 'reviewer-1' }, signal: new AbortController().signal })
  assert.equal(steered.length, 1)
  assert.match(steered[0].message.content[0].text, /review="apply"/)
  assert.match(steered[0].message.content[0].text, /dispose review=apply/)
  const waited = await call(fake, 'openspec_review', {
    action: 'wait', change: CHANGE, review: 'apply',
  })
  assert.equal(waited.waitState, 'ready')
  assert.equal(waited.ready, false)
  assert.equal(waited.nextAction, 'openspec_review action=dispose review=apply')
})

test('a not-ready draft wait points at dispose', async () => {
  const root = fixture()
  const { fake } = externalSetup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const reviewer = createFakeContext({ cwd: root })
  reviewerApply(reviewer.ctx)
  await reviewer.tools.get('openspec_reviewer').execute({
    action: 'submit',
    change: CHANGE,
    review: 'draft',
    report: report({ verdict: 'changes-requested', findings: [majorFinding()] }),
  }, { agent: { id: 'reviewer-1' }, signal: new AbortController().signal })
  const waited = await call(fake, 'openspec_review', {
    action: 'wait', change: CHANGE, review: 'draft',
  })
  assert.equal(waited.waitState, 'ready')
  assert.equal(waited.ready, false)
  assert.equal(waited.nextAction, 'openspec_review action=dispose review=draft')
})

test('a stale unreported draft round points the next action at resume', async () => {
  const root = fixture()
  const { fake } = externalSetup(root)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  writeFileSync(join(root, 'openspec', 'changes', CHANGE, 'tasks.md'), '\n## 1. Edited\n\n- [ ] 1.1 Edited task\n')
  const status = await call(fake, 'openspec_review', { action: 'status', change: CHANGE })
  assert.match(status.reasons.join(' '), /artifacts changed/)
  assert.equal(status.nextAction, 'openspec_review action=resume review=draft')
})

test('an unreported draft round with an unchanged object points at wait', async () => {
  const root = fixture()
  const { fake } = externalSetup(root)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  const status = await call(fake, 'openspec_review', { action: 'status', change: CHANGE })
  assert.equal(status.nextAction, 'openspec_review action=wait')
})
