import assert from 'node:assert/strict'
import test from 'node:test'
import {
  asCard,
  createCardProjection,
  registerCardProjection,
} from '../lib/review/card-projection.js'
import { CARD_EVENT, CARD_PROJECTION_KEY } from '../lib/review/cards.js'

/** Build one valid card payload. */
function card(overrides = {}) {
  return {
    phase: 'review',
    change: 'demo',
    review: 'draft',
    round: 1,
    findings: [],
    ...overrides,
  }
}

/** Build one plugin record event. */
function recordEvent(payload, seq = 1) {
  return { type: CARD_EVENT, seq, time: 1, ignorable: true, data: payload }
}

test('cards fold into the current turn', () => {
  const projection = createCardProjection()
  let state = projection.init()
  state = projection.apply(state, { type: 'turn/start', seq: 1, data: { turn: 3 } })
  state = projection.apply(state, recordEvent(card(), 2))
  assert.equal(projection.wire.view(state).byTurn['3'].length, 1)
  state = projection.apply(state, { type: 'turn/end', seq: 3, data: { turn: 3, reason: 'complete' } })
  assert.equal(state.currentTurn, null)
  assert.equal(projection.key, CARD_PROJECTION_KEY)
})

test('two cards share a turn in write order', () => {
  const projection = createCardProjection()
  let state = projection.init()
  state = projection.apply(state, { type: 'turn/start', seq: 1, data: { turn: 1 } })
  state = projection.apply(state, recordEvent(card({ phase: 'review' }), 2))
  state = projection.apply(state, recordEvent(card({ phase: 'resolution' }), 3))
  assert.deepEqual(projection.wire.view(state).byTurn['1'].map((entry) => entry.phase), ['review', 'resolution'])
})

test('a malformed card is skipped without failing the fold', () => {
  const projection = createCardProjection()
  let state = projection.init()
  state = projection.apply(state, { type: 'turn/start', seq: 1, data: { turn: 2 } })
  state = projection.apply(state, recordEvent(card({ phase: 'other' }), 2))
  state = projection.apply(state, recordEvent(card(), 3))
  assert.equal(projection.wire.view(state).byTurn['2'].length, 1)
  assert.equal(asCard({ change: 'x' }), null)
})

test('a card outside a turn is ignored', () => {
  const projection = createCardProjection()
  const state = projection.apply(projection.init(), recordEvent(card(), 1))
  assert.deepEqual(projection.wire.view(state), { byTurn: {} })
})

test('a throwing or missing projection service only logs', () => {
  const warnings = []
  const throwing = {
    get: () => ({ register: () => { throw new Error('duplicate key') } }),
    logger: { warn: (message) => warnings.push(message) },
  }
  assert.doesNotThrow(() => registerCardProjection(throwing))
  assert.match(warnings[0], /duplicate key/)

  const missing = { get: () => undefined, logger: { warn: (message) => warnings.push(message) } }
  assert.doesNotThrow(() => registerCardProjection(missing))
  assert.match(warnings[1], /unavailable/)
})

test('the main entry registers the projection and survives a failing registrar', async () => {
  const { apply } = await import('../index.js')
  const { createFakeContext } = await import('./fake-context.mjs')
  const { normalizeReviews } = await import('../lib/review/config.js')
  const reviews = normalizeReviews(undefined).value

  const registered = []
  const fake = createFakeContext({
    cwd: process.cwd(),
    sessionProjections: {
      register(definition) {
        registered.push(definition)
        return Promise.resolve({})
      },
    },
  })
  apply(fake.ctx, { reviews })
  assert.equal(registered[0]?.key, CARD_PROJECTION_KEY)
  assert.ok(fake.tools.has('openspec_review'))

  const throwing = createFakeContext({
    cwd: process.cwd(),
    sessionProjections: {
      register() {
        throw new Error('boom')
      },
    },
  })
  apply(throwing.ctx, { reviews })
  assert.ok(throwing.tools.has('openspec_review'))
  assert.ok(throwing.warnings.some((message) => message.includes('boom')))
})

test('the projection schemas clean persisted state and the wire view', () => {
  const projection = createCardProjection()
  const state = projection.stateSchema.parse({
    currentTurn: 2,
    byTurn: { 2: [card()], 3: [{ bad: true }], 4: 'nope' },
    ignored: true,
  })
  assert.equal(state.currentTurn, 2)
  assert.equal(state.byTurn['2'].length, 1)
  assert.equal(state.byTurn['3'], undefined)
  assert.deepEqual(projection.stateSchema.parse('bad'), { currentTurn: null, byTurn: {} })
  assert.equal(projection.wire.viewSchema.parse({ byTurn: { 2: [card()] } }).byTurn['2'].length, 1)
})

test('a rejected registration promise only logs', async () => {
  const warnings = []
  const ctx = {
    get: () => ({ register: () => Promise.reject(new Error('late boom')) }),
    logger: { warn: (message) => warnings.push(message) },
  }
  registerCardProjection(ctx)
  await new Promise((resolve) => setImmediate(resolve))
  assert.ok(warnings.some((message) => message.includes('late boom')))
})

test('malformed payloads and repeated turn events are tolerated', () => {
  const projection = createCardProjection()
  let state = projection.init()
  state = projection.apply(state, { type: 'turn/start', seq: 1, data: { turn: 2 } })
  assert.equal(projection.apply(state, { type: 'turn/start', seq: 2, data: { turn: 2 } }), state)
  assert.equal(projection.apply(state, { type: 'turn/start', seq: 2, data: {} }), state)
  assert.equal(
    projection.apply(state, { type: 'turn/end', seq: 3, data: { turn: 9, reason: { kind: 'completed' } } }),
    state,
  )
  for (const bad of [
    null,
    [],
    { phase: 'review' },
    { phase: 'review', change: '', review: 'draft', round: 1, findings: [] },
    { phase: 'review', change: 'c', review: '', round: 1, findings: [] },
    { phase: 'review', change: 'c', review: 'draft', round: -1, findings: [] },
    { phase: 'review', change: 'c', review: 'draft', round: 1.5, findings: [] },
    { phase: 'review', change: 'c', review: 'draft', round: 1, findings: [], object: 'x' },
    { phase: 'review', change: 'c', review: 'draft', round: 1, findings: 'x' },
  ]) {
    assert.equal(asCard(bad), null)
  }
})

test('a non-function registrar and a non-Error rejection only log', async () => {
  const warnings = []
  const ctx = {
    get: () => ({ register: 42 }),
    logger: { warn: (message) => warnings.push(message) },
  }
  registerCardProjection(ctx)
  assert.match(warnings[0], /unavailable/)

  const rejected = {
    get: () => ({ register: () => Promise.reject('late boom') }),
    logger: { warn: (message) => warnings.push(message) },
  }
  registerCardProjection(rejected)
  await new Promise((resolve) => setImmediate(resolve))
  assert.ok(warnings.some((message) => message.includes('late boom')))
})
