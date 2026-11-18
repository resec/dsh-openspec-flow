import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { compareCards, createReviewChannel } from '../lib/review/settings.js'
import { sessionKeyOf } from '../lib/review/cards.js'

/** Build a project, a review directory and the channel. */
function fixture(options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'dsh-cards-endpoint-'))
  const directory = join(root, 'openspec', '.review', 'local#demo')
  mkdirSync(join(directory, 'cards'), { recursive: true })
  const warnings = []
  const ctx = {
    get(name) {
      if (name === 'agents') return { list: () => [{ session: { id: 'changer' } }] }
      if (name === 'workingDirectory') return { get: () => root }
      return undefined
    },
    logger: { warn: (message) => warnings.push(message) },
  }
  const settings = { timeoutMs: 1000, reviews: { draft: {}, apply: {} } }
  return {
    root,
    directory,
    warnings,
    channel: createReviewChannel({ ctx, settings, now: options.now }),
  }
}

/** Write one card file. */
function cardFile(directory, options = {}) {
  const {
    sessionId = 'changer',
    phase = 'review',
    round = 1,
    turn = null,
    writtenAt = '2026-01-01T00:01:00.000Z',
    payload,
  } = options
  const name = `${sessionKeyOf(sessionId)}-${phase}-${String(round)}.json`
  const file = {
    schemaVersion: 1,
    sessionId,
    sessionKey: sessionKeyOf(sessionId),
    change: 'demo',
    review: 'draft',
    phase,
    round,
    turn,
    writtenAt,
    payload: payload ?? {
      phase,
      change: 'demo',
      review: 'draft',
      round,
      verdict: 'pass',
      findings: [],
      counts: { total: 0 },
    },
  }
  writeFileSync(join(directory, 'cards', name), `${JSON.stringify(file, null, 2)}\n`)
  return join(directory, 'cards', name)
}

test('an unclaimed card binds to the first turn and stays after a refresh', async () => {
  const { directory, channel } = fixture()
  try {
    const path = cardFile(directory)
    const first = await channel.dispatch('reviewCards/get', {
      sessionId: 'changer', turn: 4, from: '2026-01-01T00:00:00.000Z',
    })
    assert.equal(first.ok, true)
    assert.equal(first.value.cards.length, 1)
    assert.equal(first.value.cards[0].phase, 'review')
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).turn, 4)

    const refresh = await channel.dispatch('reviewCards/get', {
      sessionId: 'changer', turn: 4, to: '2025-12-31T00:00:00.000Z',
    })
    assert.equal(refresh.value.cards.length, 1)
    const other = await channel.dispatch('reviewCards/get', {
      sessionId: 'changer', turn: 5,
    })
    assert.deepEqual(other.value.cards, [])
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('the delivery watermark binds without a turn start time', async () => {
  const { directory, channel } = fixture()
  try {
    cardFile(directory, { writtenAt: '2026-01-01T00:05:00.000Z' })
    const first = await channel.dispatch('reviewCards/get', { sessionId: 'changer', turn: 1 })
    assert.equal(first.value.cards.length, 1)
    const second = await channel.dispatch('reviewCards/get', { sessionId: 'changer', turn: 2 })
    assert.deepEqual(second.value.cards, [])
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('a card written before the turn start is not bound', async () => {
  const { directory, channel } = fixture()
  try {
    const path = cardFile(directory, { writtenAt: '2026-01-01T00:01:00.000Z' })
    const result = await channel.dispatch('reviewCards/get', {
      sessionId: 'changer', turn: 2, from: '2026-01-01T00:02:00.000Z',
    })
    assert.deepEqual(result.value.cards, [])
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).turn, null)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('a corrupt card is skipped and the valid one is returned', async () => {
  const { directory, channel } = fixture()
  try {
    writeFileSync(join(directory, 'cards', 'corrupt.json'), '{not json')
    cardFile(directory)
    const result = await channel.dispatch('reviewCards/get', {
      sessionId: 'changer', turn: 1, from: '2026-01-01T00:00:00.000Z',
    })
    assert.equal(result.value.cards.length, 1)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('multiple cards sort review before resolution and by round', async () => {
  const { directory, channel } = fixture()
  try {
    cardFile(directory, { phase: 'resolution', round: 1, writtenAt: '2026-01-01T00:01:00.000Z' })
    cardFile(directory, { phase: 'review', round: 2, writtenAt: '2026-01-01T00:02:00.000Z' })
    const result = await channel.dispatch('reviewCards/get', {
      sessionId: 'changer', turn: 1, from: '2026-01-01T00:00:00.000Z',
    })
    assert.deepEqual(result.value.cards.map((card) => card.phase), ['review', 'resolution'])
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('invalid card shapes are skipped', async () => {
  const { directory, channel } = fixture()
  try {
    const invalid = [
      { schemaVersion: 2 },
      { schemaVersion: 1, sessionId: '', phase: 'review', round: 1, payload: {} },
      { schemaVersion: 1, sessionId: 'changer', phase: 'bad', round: 1, payload: {} },
      { schemaVersion: 1, sessionId: 'changer', phase: 'review', round: 0, payload: {} },
      { schemaVersion: 1, sessionId: 'changer', phase: 'review', round: 1, payload: [] },
      null,
    ]
    invalid.forEach((value, index) => {
      writeFileSync(join(directory, 'cards', `invalid-${String(index)}.json`), JSON.stringify(value))
    })
    cardFile(directory)
    const result = await channel.dispatch('reviewCards/get', {
      sessionId: 'changer', turn: 1, from: '2026-01-01T00:00:00.000Z',
    })
    assert.equal(result.value.cards.length, 1)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('a project without a review root returns no cards', async () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-cards-empty-'))
  try {
    mkdirSync(join(root, 'openspec'), { recursive: true })
    const ctx = {
      get(name) {
        if (name === 'agents') return { list: () => [{ session: { id: 'changer' } }] }
        if (name === 'workingDirectory') return { get: () => root }
        return undefined
      },
      logger: { warn: () => {} },
    }
    const channel = createReviewChannel({ ctx, settings: { timeoutMs: 1000, reviews: {} } })
    const result = await channel.dispatch('reviewCards/get', { sessionId: 'changer', turn: 1 })
    assert.deepEqual(result.value.cards, [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a broken review entry, a cardless change and a non-JSON file are skipped', async () => {
  const { directory, channel } = fixture()
  try {
    const base = join(directory, '..')
    symlinkSync(join(base, 'missing-target'), join(base, 'broken-link'))
    mkdirSync(join(base, 'empty-change'), { recursive: true })
    writeFileSync(join(directory, 'cards', 'notes.txt'), 'not a card')
    cardFile(directory)
    const result = await channel.dispatch('reviewCards/get', {
      sessionId: 'changer', turn: 1, from: '2026-01-01T00:00:00.000Z',
    })
    assert.equal(result.value.cards.length, 1)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('a delivery write failure is logged and keeps the endpoint answer', async () => {
  const { directory, channel, warnings } = fixture()
  try {
    mkdirSync(join(directory, 'card-delivery.json'))
    cardFile(directory)
    const result = await channel.dispatch('reviewCards/get', {
      sessionId: 'changer', turn: 1, from: '2026-01-01T00:00:00.000Z',
    })
    assert.equal(result.ok, true)
    assert.ok(warnings.some((message) => message.includes('could not be delivered')))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('the endpoint rejects a missing session or turn', async () => {
  const { directory, channel } = fixture()
  try {
    const noSession = await channel.dispatch('reviewCards/get', { turn: 1 })
    assert.equal(noSession.ok, false)
    assert.match(noSession.error.message, /sessionId/)
    const noTurn = await channel.dispatch('reviewCards/get', { sessionId: 'changer' })
    assert.equal(noTurn.ok, false)
    assert.match(noTurn.error.message, /turn/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('an unparsable turn end is rejected and binds nothing', async () => {
  const { directory, channel } = fixture()
  try {
    const path = cardFile(directory)
    const result = await channel.dispatch('reviewCards/get', {
      sessionId: 'changer', turn: 1, to: 'not-a-date',
    })
    assert.equal(result.ok, false)
    assert.match(result.error.message, /turn end/)
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).turn, null)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('an offset-form turn end compares by instant', async () => {
  const { directory, channel } = fixture()
  try {
    const path = cardFile(directory, { writtenAt: '2026-01-01T00:01:00.000Z' })
    const skipped = await channel.dispatch('reviewCards/get', {
      sessionId: 'changer',
      turn: 1,
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-01-01T08:00:00+08:00',
    })
    assert.deepEqual(skipped.value.cards, [])
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).turn, null)
    const bound = await channel.dispatch('reviewCards/get', {
      sessionId: 'changer',
      turn: 1,
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-01-01T09:00:00+08:00',
    })
    assert.equal(bound.value.cards.length, 1)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('a card written after the turn end is skipped and the later turn binds it', async () => {
  const { directory, channel } = fixture({ now: () => Date.parse('2026-01-01T00:40:00.000Z') })
  try {
    const path = cardFile(directory, { writtenAt: '2026-01-01T00:20:00.000Z' })
    const historical = await channel.dispatch('reviewCards/get', {
      sessionId: 'changer',
      turn: 21,
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-01-01T00:10:00.000Z',
    })
    assert.deepEqual(historical.value.cards, [])
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).turn, null)
    const delivery = JSON.parse(readFileSync(join(directory, 'card-delivery.json'), 'utf8'))
    assert.equal(
      delivery.sessions[sessionKeyOf('changer')].lastDeliveredAt,
      '2026-01-01T00:10:00.000Z',
    )
    const later = await channel.dispatch('reviewCards/get', {
      sessionId: 'changer', turn: 22, to: '2026-01-01T00:30:00.000Z',
    })
    assert.equal(later.value.cards.length, 1)
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).turn, 22)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('cards sort by write time inside one phase', async () => {
  const { directory, channel } = fixture()
  try {
    const draft = {
      phase: 'review',
      change: 'demo',
      review: 'draft',
      round: 4,
      verdict: 'pass',
      findings: [],
      counts: { total: 17 },
    }
    const apply = { ...draft, review: 'apply', round: 1, counts: { total: 4 } }
    cardFile(directory, {
      phase: 'review', round: 4, writtenAt: '2026-01-01T00:03:00.000Z', payload: draft,
    })
    cardFile(directory, {
      phase: 'review', round: 1, writtenAt: '2026-01-01T00:20:00.000Z', payload: apply,
    })
    const result = await channel.dispatch('reviewCards/get', {
      sessionId: 'changer',
      turn: 1,
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-01-01T00:30:00.000Z',
    })
    assert.deepEqual(result.value.cards.map((card) => card.review), ['draft', 'apply'])
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('compareCards orders by phase, write time and round', () => {
  const card = (phase, round, writtenAt) => ({ payload: { phase, round }, writtenAt })
  const atOne = '2026-01-01T00:01:00.000Z'
  const atTwo = '2026-01-01T00:02:00.000Z'
  assert.ok(compareCards(card('review', 1, atTwo), card('resolution', 1, atOne)) < 0)
  assert.ok(compareCards(card('other', 1, atOne), card('review', 1, atTwo)) > 0)
  assert.ok(compareCards({ payload: { phase: 'review', round: 1 }, writtenAt: null }, card('review', 2, atOne)) > 0)
  assert.ok(compareCards(card('review', 2, atOne), { payload: { phase: 'review', round: 1 }, writtenAt: null }) < 0)
  assert.ok(compareCards(card('review', 1, atOne), card('review', 2, atTwo)) < 0)
  assert.ok(compareCards(card('review', 2, atTwo), card('review', 1, atOne)) > 0)
  assert.ok(compareCards(card('review', 1, atOne), card('review', 2, atOne)) < 0)
  assert.equal(compareCards(card('review', 2, atOne), card('review', 2, atOne)), 0)
})

test('a card without a write time follows the watermark fallback', async () => {
  const { directory, channel } = fixture()
  try {
    const path = cardFile(directory)
    const file = JSON.parse(readFileSync(path, 'utf8'))
    delete file.writtenAt
    writeFileSync(path, JSON.stringify(file))
    const result = await channel.dispatch('reviewCards/get', { sessionId: 'changer', turn: 1 })
    assert.equal(result.value.cards.length, 1)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('a card without a write time is skipped when a turn end is given', async () => {
  const { directory, channel } = fixture()
  try {
    const path = cardFile(directory)
    const file = JSON.parse(readFileSync(path, 'utf8'))
    delete file.writtenAt
    writeFileSync(path, JSON.stringify(file))
    const result = await channel.dispatch('reviewCards/get', {
      sessionId: 'changer', turn: 1, to: '2026-01-01T00:10:00.000Z',
    })
    assert.deepEqual(result.value.cards, [])
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).turn, null)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
