import assert from 'node:assert/strict'
import {
  mkdirSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { apply } from '../index.js'
import { apply as reviewerApply } from '../reviewer.js'
import { createFakeContext } from './fake-context.mjs'
import {
  CHANGE, fixture, setup, call, reviewDir, report, majorFinding, gitFixture, passDraft, externalSetup, cleanupFixtures,
} from './review-fixtures.mjs'

test.after(cleanupFixtures)

/**
 * Run `fn` with a short poll interval so the wait cases do not sleep on the
 * default 250 ms cadence, and restore the previous value afterwards.
 * @param fn - the work that runs while the interval is set.
 * @returns the work's result.
 */
async function withPollInterval(fn) {
  const previous = process.env.OPENSPEC_FLOW_REVIEW_POLL_MS
  process.env.OPENSPEC_FLOW_REVIEW_POLL_MS = '10'
  try {
    return await fn()
  } finally {
    if (previous === undefined) delete process.env.OPENSPEC_FLOW_REVIEW_POLL_MS
    else process.env.OPENSPEC_FLOW_REVIEW_POLL_MS = previous
  }
}

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
  const waiting = withPollInterval(async () => {
    const pending = call(second.fake, 'openspec_review', {
      action: 'wait', change: CHANGE, review: 'draft',
    })
    await reviewer.tools.get('openspec_reviewer').execute({
      action: 'submit', change: CHANGE, review: 'draft', report: report(),
    }, { agent: { id: 'reviewer-1' }, signal: new AbortController().signal })
    return await pending
  })
  const ready = await waiting
  assert.equal(ready.ready, true)
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
  const pending = withPollInterval(async () => await call(fake, 'openspec_review', {
    action: 'wait', change: CHANGE, review: 'draft',
  }))
  await new Promise((resolve) => setTimeout(resolve, 300))
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
  const pending = withPollInterval(async () => fake.tools.get('openspec_review').execute({
    action: 'wait', change: CHANGE, review: 'draft',
  }, { agent: { id: 'review-test' }, signal: controller.signal }))
  pending.catch(() => {})
  await new Promise((resolve) => setTimeout(resolve, 300))
  controller.abort()
  await assert.rejects(pending, /wait was cancelled|aborted/i)
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

  const reviewer = createFakeContext({ cwd: root })
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
    action: 'dispose', change: CHANGE, id: 'R1-01', status: 'fixed', note: 'Added the task.',
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


