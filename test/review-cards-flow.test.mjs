import assert from 'node:assert/strict'
import test from 'node:test'
import {
  SESSION_FORMAT_VERSION,
  Session,
} from '@deepseek-ai/dsh-session'
import {
  CHANGE,
  cleanupFixtures,
  fixture,
  majorFinding,
  report,
  setup,
} from './review-fixtures.mjs'
import { createCardProjection } from '../lib/review/card-projection.js'
import { CARD_EVENT } from '../lib/review/cards.js'

test.after(cleanupFixtures)

/** Build a detached Session. */
function session(id) {
  return Session.create(id, [], {
    version: SESSION_FORMAT_VERSION,
    id,
    createdAt: Date.now(),
    isSeeded: false,
  })
}

/** Execute one tool with a real Session behind the agent. */
async function callWith(fake, name, args, agent) {
  const tool = fake.tools.get(name)
  assert.ok(tool, `tool ${name} is registered`)
  return await tool.execute(args, { agent, signal: new AbortController().signal })
}

/** Fold the session log through the card projection. */
function fold(target) {
  const projection = createCardProjection()
  let state = projection.init()
  for (const event of target.log) state = projection.apply(state, event)
  return projection.wire.view(state).byTurn
}

/** Count the card records in one session. */
function cardsIn(target) {
  return target.log.filter((event) => event.type === CARD_EVENT)
}

test('a self-review round writes a review card and a resolution card', async () => {
  const root = fixture()
  const fake = setup(root)
  const target = session('changer')
  const agent = { id: 'review-test', session: target }

  target.append('turn/start', { turn: 1 })
  await callWith(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  }, agent)
  await callWith(fake, 'openspec_review', {
    action: 'self-report', change: CHANGE,
    report: report({ verdict: 'changes-requested', findings: [majorFinding()] }),
  }, agent)
  await callWith(fake, 'openspec_review', {
    action: 'dispose', change: CHANGE, id: 'R1-01', status: 'fixed', note: 'Added the task.',
  }, agent)
  await callWith(fake, 'openspec_review', { action: 'resume', change: CHANGE }, agent)
  target.append('turn/end', { turn: 1, reason: { kind: 'completed' } })

  const cards = cardsIn(target)
  assert.equal(cards.length, 2)
  assert.deepEqual(cards.map((event) => event.data.phase), ['review', 'resolution'])
  assert.equal(cards[0].data.report.findings[0].evidence, 'proposal.md adds capability theme; tasks.md has no matching task.')
  assert.equal(cards[1].data.findings[0].status, 'fixed')
  assert.equal(cards[1].data.findings[0].note, 'Added the task.')
  for (const card of cards) {
    assert.ok(!target.surface.nodes.includes(card.seq), 'the card record stays out of the model surface')
  }
  const byTurn = fold(target)
  assert.deepEqual(byTurn['1'].map((card) => card.phase), ['review', 'resolution'])
})

test('a failed card write does not fail the tool', async () => {
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
})

test('an independent review writes the reviewer card and the main-session card once', async () => {
  const { apply: reviewerApply } = await import('../reviewer.js')
  const { createFakeContext } = await import('./fake-context.mjs')
  const { externalSetup } = await import('./review-fixtures.mjs')
  const root = fixture()
  const { fake, subagents } = externalSetup(root)
  const changerSession = session('changer')
  const changer = { id: 'review-test', session: changerSession }
  changerSession.append('turn/start', { turn: 1 })
  await callWith(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  }, changer)

  const reviewer = createFakeContext({ cwd: root, subagents })
  reviewerApply(reviewer.ctx)
  const reviewerSession = session('reviewer-1')
  const reviewerAgent = { id: 'reviewer-1', session: reviewerSession }
  reviewerSession.append('turn/start', { turn: 1 })
  await reviewer.tools.get('openspec_reviewer').execute({
    action: 'submit',
    change: CHANGE,
    review: 'draft',
    report: report(),
  }, { agent: reviewerAgent, signal: new AbortController().signal })
  reviewerSession.append('turn/end', { turn: 1, reason: { kind: 'completed' } })

  await callWith(fake, 'openspec_review', { action: 'wait', change: CHANGE }, changer)
  await callWith(fake, 'openspec_review', { action: 'report', change: CHANGE }, changer)
  changerSession.append('turn/end', { turn: 1, reason: { kind: 'completed' } })

  const reviewerCards = cardsIn(reviewerSession)
  const mainCards = cardsIn(changerSession)
  assert.equal(reviewerCards.length, 1)
  assert.equal(mainCards.length, 1, 'wait writes the main card and report does not duplicate it')
  assert.equal(reviewerCards[0].data.phase, 'review')
  assert.equal(mainCards[0].data.phase, 'review')
  assert.deepEqual(fold(reviewerSession)['1'].map((card) => card.phase), ['review'])
  assert.deepEqual(fold(changerSession)['1'].map((card) => card.phase), ['review'])
})

test('a passing round with a disposed minor finding writes the resolution card', async () => {
  const root = fixture()
  const fake = setup(root)
  const target = session('changer')
  const agent = { id: 'review-test', session: target }
  target.append('turn/start', { turn: 1 })
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
    action: 'dispose', change: CHANGE, id: 'R1-01', status: 'deferred', note: 'Follow up in ISS-9.',
  }, agent)
  assert.equal(disposed.ready, true)
  target.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  const cards = cardsIn(target)
  assert.deepEqual(cards.map((event) => event.data.phase), ['review', 'resolution'])
  assert.equal(cards[1].data.findings[0].status, 'deferred')
  assert.equal(cards[1].data.findings[0].note, 'Follow up in ISS-9.')
})
