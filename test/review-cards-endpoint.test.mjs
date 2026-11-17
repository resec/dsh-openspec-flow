import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { createReviewChannel } from '../lib/review/settings.js'
import { sessionKeyOf } from '../lib/review/cards.js'

/** Build a project, a review directory and the channel. */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'dsh-cards-endpoint-'))
  const directory = join(root, 'openspec', '.review', 'local#demo')
  mkdirSync(join(directory, 'cards'), { recursive: true })
  const ctx = {
    get(name) {
      if (name === 'agents') return { list: () => [{ session: { id: 'changer' } }] }
      if (name === 'workingDirectory') return { get: () => root }
      return undefined
    },
    logger: { warn: () => {} },
  }
  const settings = { timeoutMs: 1000, reviews: { draft: {}, apply: {} } }
  return { root, directory, channel: createReviewChannel({ ctx, settings }) }
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
      sessionId: 'changer', turn: 4,
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
