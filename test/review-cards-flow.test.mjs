import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import {
  CHANGE,
  cleanupFixtures,
  fixture,
  majorFinding,
  report,
  setup,
} from './review-fixtures.mjs'

test.after(cleanupFixtures)

/** The change's review directory. */
function reviewDir(root) {
  const base = join(root, 'openspec', '.review')
  const name = readdirSync(base).find((entry) => entry.includes(`#${CHANGE}`))
  assert.ok(name, 'the review directory exists')
  return join(base, name)
}

/** The card payloads written for one session. */
function cardsIn(root, sessionId) {
  const directory = join(reviewDir(root), 'cards')
  let entries
  try {
    entries = readdirSync(directory)
  } catch {
    return []
  }
  return entries
    .map((name) => JSON.parse(readFileSync(join(directory, name), 'utf8')))
    .filter((file) => file.sessionId === sessionId)
    .sort((left, right) => String(left.writtenAt).localeCompare(String(right.writtenAt)))
    .map((file) => file.payload)
}

/** Execute one tool with a fake agent. */
async function callWith(fake, name, args, agent) {
  const tool = fake.tools.get(name)
  assert.ok(tool, `tool ${name} is registered`)
  return await tool.execute(args, { agent, signal: new AbortController().signal })
}

test('a self-review round writes a review card and a resolution card', async () => {
  const root = fixture()
  const fake = setup(root)
  const agent = { id: 'review-test', session: { id: 'changer' } }

  await callWith(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  }, agent)
  await callWith(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE,
    report: report({ verdict: 'changes-requested', findings: [majorFinding()] }),
  }, agent)
  await callWith(fake, 'openspec_review', {
    action: 'dispose', review: 'draft', change: CHANGE, id: 'R1-01', status: 'fixed', note: 'Added the task.',
  }, agent)
  await callWith(fake, 'openspec_review', { action: 'resume', change: CHANGE }, agent)

  const cards = cardsIn(root, 'changer')
  assert.equal(cards.length, 2)
  assert.deepEqual(cards.map((card) => card.phase), ['review', 'resolution'])
  assert.equal(cards[0].report.findings[0].evidence, 'proposal.md adds capability theme; tasks.md has no matching task.')
  assert.equal(cards[1].findings[0].status, 'fixed')
  assert.equal(cards[1].findings[0].note, 'Added the task.')
})

test('review tool results carry no card payload or card-specific field', async () => {
  const root = fixture()
  const fake = setup(root)
  const agent = { id: 'review-test', session: { id: 'changer' } }
  await callWith(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  }, agent)
  const submitted = await callWith(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE,
    report: report({ verdict: 'changes-requested', findings: [majorFinding()] }),
  }, agent)
  const reported = await callWith(fake, 'openspec_review', { action: 'report', change: CHANGE }, agent)
  for (const result of [submitted, reported]) {
    assert.equal(Object.hasOwn(result, 'card'), false)
    assert.equal(Object.hasOwn(result, 'cards'), false)
    assert.equal(Object.hasOwn(result, 'reviewCard'), false)
  }
  assert.equal(reported.report.verdict, 'changes-requested')
})

test('a failed card write does not fail the tool and report does not backfill it', async () => {
  const root = fixture()
  const fake = setup(root)
  await callWith(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  }, { id: 'review-test' })
  const submitted = await callWith(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE,
    report: report({ verdict: 'changes-requested', findings: [majorFinding()] }),
  }, { id: 'review-test' })
  assert.equal(submitted.ready, false)
  assert.ok(fake.warnings.some((message) => message.includes('no Session is available')))
  await callWith(fake, 'openspec_review', { action: 'report', change: CHANGE }, { id: 'review-test', session: { id: 'changer' } })
  assert.deepEqual(cardsIn(root, 'changer'), [])
  const record = JSON.parse(readFileSync(join(reviewDir(root), 'review.json'), 'utf8'))
  assert.deepEqual(record.cards ?? [], [])
})

test('an independent review writes only the reviewer card', async () => {
  const { apply: reviewerApply } = await import('../reviewer.js')
  const { createFakeContext } = await import('./fake-context.mjs')
  const { externalSetup } = await import('./review-fixtures.mjs')
  const root = fixture()
  const { fake, subagents } = externalSetup(root)
  const changer = { id: 'review-test', session: { id: 'changer' } }
  await callWith(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  }, changer)

  const reviewer = createFakeContext({ cwd: root, subagents })
  reviewerApply(reviewer.ctx)
  await reviewer.tools.get('openspec_reviewer').execute({
    action: 'submit',
    change: CHANGE,
    review: 'draft',
    report: report(),
  }, { agent: { id: 'reviewer-1', session: { id: 'reviewer-1' } }, signal: new AbortController().signal })

  await callWith(fake, 'openspec_review', { action: 'wait', change: CHANGE }, changer)
  await callWith(fake, 'openspec_review', { action: 'report', change: CHANGE }, changer)

  const reviewerCards = cardsIn(root, 'reviewer-1')
  const mainCards = cardsIn(root, 'changer')
  assert.equal(reviewerCards.length, 1)
  assert.equal(mainCards.length, 0, 'wait and report write no changer card')
  assert.equal(reviewerCards[0].phase, 'review')
})

test('a passing round with a disposed minor finding writes the resolution card', async () => {
  const root = fixture()
  const fake = setup(root)
  const agent = { id: 'review-test', session: { id: 'changer' } }
  await callWith(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  }, agent)
  const minor = {
    id: 'R1-01',
    severity: 'minor',
    axis: 'coherence',
    location: 'design.md',
    title: 'Minor wording',
    problem: 'A sentence is unclear.',
    evidence: 'design.md',
    suggestion: 'Rewrite it.',
  }
  await callWith(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE,
    report: report({ verdict: 'pass', findings: [minor] }),
  }, agent)
  const disposed = await callWith(fake, 'openspec_review', {
    action: 'dispose', review: 'draft', change: CHANGE, id: 'R1-01', status: 'deferred', note: 'Follow up in ISS-9.',
  }, agent)
  assert.equal(disposed.ready, true)
  const cards = cardsIn(root, 'changer')
  assert.deepEqual(cards.map((card) => card.phase), ['review', 'resolution'])
  assert.equal(cards[1].findings[0].status, 'deferred')
  assert.equal(cards[1].findings[0].note, 'Follow up in ISS-9.')
})

test('report without wait writes no changer card', async () => {
  const { apply: reviewerApply } = await import('../reviewer.js')
  const { createFakeContext } = await import('./fake-context.mjs')
  const { externalSetup } = await import('./review-fixtures.mjs')
  const root = fixture()
  const { fake, subagents } = externalSetup(root)
  const changer = { id: 'review-test', session: { id: 'changer' } }
  await callWith(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  }, changer)
  const reviewer = createFakeContext({ cwd: root, subagents })
  reviewerApply(reviewer.ctx)
  await reviewer.tools.get('openspec_reviewer').execute({
    action: 'submit', change: CHANGE, review: 'draft', report: report(),
  }, { agent: { id: 'reviewer-1', session: { id: 'reviewer-1' } }, signal: new AbortController().signal })
  await callWith(fake, 'openspec_review', { action: 'report', change: CHANGE }, changer)
  assert.deepEqual(cardsIn(root, 'changer'), [])
})

test('report for an older round writes no new card', async () => {
  const root = fixture()
  const fake = setup(root)
  const agent = { id: 'review-test', session: { id: 'changer' } }
  await callWith(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  }, agent)
  await callWith(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE,
    report: report({ verdict: 'changes-requested', findings: [majorFinding()] }),
  }, agent)
  await callWith(fake, 'openspec_review', {
    action: 'dispose', review: 'draft', change: CHANGE, id: 'R1-01', status: 'fixed', note: 'Added the task.',
  }, agent)
  await callWith(fake, 'openspec_review', { action: 'resume', change: CHANGE }, agent)
  const before = cardsIn(root, 'changer').length
  const other = { id: 'review-test', session: { id: 'changer-2' } }
  await callWith(fake, 'openspec_review', { action: 'report', change: CHANGE, round: 1 }, other)
  assert.equal(cardsIn(root, 'changer-2').length, 0)
  assert.equal(cardsIn(root, 'changer').length, before)
})

test('a passing round without findings writes only the review card', async () => {
  const root = fixture()
  const fake = setup(root)
  const agent = { id: 'review-test', session: { id: 'changer' } }
  await callWith(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  }, agent)
  await callWith(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE, report: report({ verdict: 'pass', findings: [] }),
  }, agent)
  const cards = cardsIn(root, 'changer')
  assert.deepEqual(cards.map((card) => card.phase), ['review'])
})
