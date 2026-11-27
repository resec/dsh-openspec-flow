import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { compareCards, createReviewChannel } from '../lib/review/settings.js'
import { sessionKeyOf } from '../lib/review/cards.js'
import { reviewFile } from '../lib/review/record.js'
import { reviewDirectory, reviewRoot, writeJsonAtomic } from '../lib/review/store.js'
import { cleanupTempDirs, tempDir } from './temp.mjs'

test.after(cleanupTempDirs)

/** Build a project, a review directory and the channel. */
function fixture(options = {}) {
  const root = tempDir('dsh-cards-endpoint-')
  const directory = join(root, 'openspec', '.review', 'local#demo')
  mkdirSync(join(directory, 'cards'), { recursive: true })
  const warnings = []
  const agents = options.agents ?? [{ session: { id: 'changer' } }]
  const cwdOf = options.cwdOf ?? (() => root)
  const ctx = {
    get(name) {
      if (name === 'agents') return { list: () => agents }
      if (name === 'workingDirectory') return { get: (agent) => cwdOf(agent) }
      return undefined
    },
    logger: { warn: (message) => warnings.push(message) },
  }
  const settings = { timeoutMs: 1000, reviews: { draft: {}, apply: {} } }
  return {
    root,
    directory,
    warnings,
    channel: createReviewChannel({ ctx, settings, now: options.now, io: options.io }),
  }
}

/** Write one card file. */
function cardFile(directory, options = {}) {
  const {
    sessionId = 'changer',
    review = 'draft',
    kind = review,
    legacyName = false,
    phase = 'review',
    round = 1,
    turn = null,
    writtenAt = '2026-01-01T00:01:00.000Z',
    payload,
  } = options
  const base = legacyName
    ? `${sessionKeyOf(sessionId)}-${phase}-${String(round)}`
    : `${sessionKeyOf(sessionId)}-${kind}-${phase}-${String(round)}`
  const name = `${base}.json`
  const file = {
    schemaVersion: 1,
    sessionId,
    sessionKey: sessionKeyOf(sessionId),
    change: 'demo',
    review,
    phase,
    round,
    turn,
    writtenAt,
    payload: payload ?? {
      phase,
      change: 'demo',
      review,
      round,
      verdict: 'pass',
      findings: [],
      counts: { total: 0 },
    },
  }
  writeFileSync(join(directory, 'cards', name), `${JSON.stringify(file, null, 2)}\n`)
  return join(directory, 'cards', name)
}

/** Write one review record for the fixture directory. */
function reviewRecord(directory, options = {}) {
  const {
    kind = 'draft',
    independent = true,
    changerSessionId,
  } = options
  const record = {
    change: 'demo',
    review: kind,
    independent,
    mode: independent ? 'reviewer' : 'self',
    state: 'in-review',
  }
  if (changerSessionId !== null) record.changerSessionId = changerSessionId ?? 'changer'
  writeFileSync(join(directory, reviewFile(kind)), `${JSON.stringify(record, null, 2)}\n`)
}

test('an unclaimed card binds to the first turn and stays after a refresh', async () => {
  const { root, directory, channel } = fixture()
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
    rmSync(root, { recursive: true, force: true })
  }
})

test('the delivery watermark binds without a turn start time', async () => {
  const { root, directory, channel } = fixture()
  try {
    cardFile(directory, { writtenAt: '2026-01-01T00:05:00.000Z' })
    const first = await channel.dispatch('reviewCards/get', { sessionId: 'changer', turn: 1 })
    assert.equal(first.value.cards.length, 1)
    const second = await channel.dispatch('reviewCards/get', { sessionId: 'changer', turn: 2 })
    assert.deepEqual(second.value.cards, [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a card written before the turn start is not bound', async () => {
  const { root, directory, channel } = fixture()
  try {
    const path = cardFile(directory, { writtenAt: '2026-01-01T00:01:00.000Z' })
    const result = await channel.dispatch('reviewCards/get', {
      sessionId: 'changer', turn: 2, from: '2026-01-01T00:02:00.000Z',
    })
    assert.deepEqual(result.value.cards, [])
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).turn, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a corrupt card is skipped and the valid one is returned', async () => {
  const { root, directory, channel } = fixture()
  try {
    writeFileSync(join(directory, 'cards', `${sessionKeyOf('changer')}-corrupt-1.json`), '{not json')
    cardFile(directory)
    const result = await channel.dispatch('reviewCards/get', {
      sessionId: 'changer', turn: 1, from: '2026-01-01T00:00:00.000Z',
    })
    assert.equal(result.value.cards.length, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('multiple cards sort review before resolution and by round', async () => {
  const { root, directory, channel } = fixture()
  try {
    cardFile(directory, { phase: 'resolution', round: 1, writtenAt: '2026-01-01T00:01:00.000Z' })
    cardFile(directory, { phase: 'review', round: 2, writtenAt: '2026-01-01T00:02:00.000Z' })
    const result = await channel.dispatch('reviewCards/get', {
      sessionId: 'changer', turn: 1, from: '2026-01-01T00:00:00.000Z',
    })
    assert.deepEqual(result.value.cards.map((card) => card.phase), ['review', 'resolution'])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('invalid card shapes are skipped', async () => {
  const { root, directory, channel } = fixture()
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
      writeFileSync(join(directory, 'cards', `${sessionKeyOf('changer')}-invalid-${String(index)}.json`), JSON.stringify(value))
    })
    cardFile(directory)
    const result = await channel.dispatch('reviewCards/get', {
      sessionId: 'changer', turn: 1, from: '2026-01-01T00:00:00.000Z',
    })
    assert.equal(result.value.cards.length, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a project without a review root returns no cards', async () => {
  const root = tempDir('dsh-cards-empty-')
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
  const { root, directory, channel } = fixture()
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
    rmSync(root, { recursive: true, force: true })
  }
})

test('a delivery write failure is logged and keeps the endpoint answer', async () => {
  const { root, directory, channel, warnings } = fixture()
  try {
    mkdirSync(join(directory, 'card-delivery.json'))
    cardFile(directory)
    const result = await channel.dispatch('reviewCards/get', {
      sessionId: 'changer', turn: 1, from: '2026-01-01T00:00:00.000Z',
    })
    assert.equal(result.ok, true)
    assert.ok(warnings.some((message) => message.includes('could not be delivered')))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('the endpoint rejects a missing session or turn', async () => {
  const { root, directory, channel } = fixture()
  try {
    const noSession = await channel.dispatch('reviewCards/get', { turn: 1 })
    assert.equal(noSession.ok, false)
    assert.match(noSession.error.message, /sessionId/)
    const noTurn = await channel.dispatch('reviewCards/get', { sessionId: 'changer' })
    assert.equal(noTurn.ok, false)
    assert.match(noTurn.error.message, /turn/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('an unparsable turn end is rejected and binds nothing', async () => {
  const { root, directory, channel } = fixture()
  try {
    const path = cardFile(directory)
    const result = await channel.dispatch('reviewCards/get', {
      sessionId: 'changer', turn: 1, to: 'not-a-date',
    })
    assert.equal(result.ok, false)
    assert.match(result.error.message, /turn end/)
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).turn, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('an offset-form turn end compares by instant', async () => {
  const { root, directory, channel } = fixture()
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
    rmSync(root, { recursive: true, force: true })
  }
})

test('a card written after the turn end is skipped and the later turn binds it', async () => {
  const { root, directory, channel } = fixture({ now: () => Date.parse('2026-01-01T00:40:00.000Z') })
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
    rmSync(root, { recursive: true, force: true })
  }
})

test('cards sort by write time inside one phase', async () => {
  const { root, directory, channel } = fixture()
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
    rmSync(root, { recursive: true, force: true })
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
  const { root, directory, channel } = fixture()
  try {
    const path = cardFile(directory)
    const file = JSON.parse(readFileSync(path, 'utf8'))
    delete file.writtenAt
    writeFileSync(path, JSON.stringify(file))
    const result = await channel.dispatch('reviewCards/get', { sessionId: 'changer', turn: 1 })
    assert.equal(result.value.cards.length, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a card without a write time is skipped when a turn end is given', async () => {
  const { root, directory, channel } = fixture()
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
    rmSync(root, { recursive: true, force: true })
  }
})

test('a non-string or empty turn end is rejected and binds nothing', async () => {
  const { root, directory, channel } = fixture()
  try {
    const path = cardFile(directory)
    for (const value of [1767225600000, '', '   ', null, true, ['2026-01-01']]) {
      const result = await channel.dispatch('reviewCards/get', {
        sessionId: 'changer', turn: 1, to: value,
      })
      assert.equal(result.ok, false, `to ${JSON.stringify(value)} is rejected`)
      assert.match(result.error.message, /turn end/)
    }
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).turn, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a stored watermark later than the turn end is kept', async () => {
  const { root, directory, channel } = fixture()
  try {
    writeFileSync(join(directory, 'card-delivery.json'), JSON.stringify({
      schemaVersion: 1,
      sessions: { [sessionKeyOf('changer')]: { lastDeliveredAt: '2026-01-01T00:40:00.000Z' } },
    }))
    const path = cardFile(directory, { writtenAt: '2026-01-01T00:20:00.000Z' })
    const result = await channel.dispatch('reviewCards/get', {
      sessionId: 'changer', turn: 21, to: '2026-01-01T00:10:00.000Z',
    })
    assert.deepEqual(result.value.cards, [])
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).turn, null)
    const delivery = JSON.parse(readFileSync(join(directory, 'card-delivery.json'), 'utf8'))
    assert.equal(
      delivery.sessions[sessionKeyOf('changer')].lastDeliveredAt,
      '2026-01-01T00:40:00.000Z',
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a request without a turn end resets the watermark to now', async () => {
  const { root, directory, channel } = fixture({ now: () => Date.parse('2026-01-01T00:00:00.000Z') })
  try {
    cardFile(directory, { writtenAt: '2026-01-01T00:30:00.000Z' })
    writeFileSync(join(directory, 'card-delivery.json'), JSON.stringify({
      schemaVersion: 1,
      sessions: { [sessionKeyOf('changer')]: { lastDeliveredAt: '2026-01-01T01:00:00.000Z' } },
    }))
    const result = await channel.dispatch('reviewCards/get', { sessionId: 'changer', turn: 1 })
    assert.equal(result.ok, true)
    const delivery = JSON.parse(readFileSync(join(directory, 'card-delivery.json'), 'utf8'))
    assert.equal(
      delivery.sessions[sessionKeyOf('changer')].lastDeliveredAt,
      '2026-01-01T00:00:00.000Z',
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})


test('legacy cards remain readable until migration and are suppressed after removal', async () => {
  const root = tempDir('dsh-cards-legacy-')
  const legacy = join(root, 'openspec', '.review', 'local#demo')
  mkdirSync(join(legacy, 'cards'), { recursive: true })
  execFileSync('git', ['-C', root, 'init', '-q'])
  const channel = createReviewChannel({
    ctx: {
      get(name) {
        if (name === 'agents') return { list: () => [{ session: { id: 'changer' } }] }
        if (name === 'workingDirectory') return { get: () => root }
        return undefined
      },
      logger: { warn: () => {} },
    },
    settings: { timeoutMs: 1000, reviews: { draft: {}, apply: {} } },
  })
  try {
    const cardPath = cardFile(legacy)
    const before = await channel.dispatch('reviewCards/get', { sessionId: 'changer', turn: 1 })
    assert.equal(before.value.cards.length, 1)
    assert.equal(JSON.parse(readFileSync(cardPath, 'utf8')).turn, 1)
    assert.ok(existsSync(join(legacy, 'card-delivery.json')))
    const shared = reviewDirectory(root, null, 'demo')
    rmSync(shared, { recursive: true, force: true })
    const after = await channel.dispatch('reviewCards/get', { sessionId: 'changer', turn: 2 })
    assert.deepEqual(after.value.cards, [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('an independent review withholds the changer review card and keeps the resolution card', async () => {
  const { root, directory, channel } = fixture()
  try {
    reviewRecord(directory)
    const reviewPath = cardFile(directory, { phase: 'review', round: 1 })
    cardFile(directory, { phase: 'resolution', round: 1 })
    const result = await channel.dispatch('reviewCards/get', {
      sessionId: 'changer', turn: 1, from: '2026-01-01T00:00:00.000Z',
    })
    assert.deepEqual(result.value.cards.map((card) => card.phase), ['resolution'])
    assert.equal(JSON.parse(readFileSync(reviewPath, 'utf8')).turn, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('an already-bound changer review card stays hidden', async () => {
  const { root, directory, channel } = fixture()
  try {
    reviewRecord(directory)
    const path = cardFile(directory, { turn: 5 })
    const result = await channel.dispatch('reviewCards/get', { sessionId: 'changer', turn: 5 })
    assert.deepEqual(result.value.cards, [])
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).turn, 5)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a reviewer review card is delivered for an independent review', async () => {
  const { root, directory, channel } = fixture()
  try {
    reviewRecord(directory)
    cardFile(directory, { sessionId: 'reviewer-1' })
    const result = await channel.dispatch('reviewCards/get', { sessionId: 'reviewer-1', turn: 1 })
    assert.equal(result.value.cards.length, 1)
    assert.equal(result.value.cards[0].review, 'draft')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a self review keeps the changer review card', async () => {
  const { root, directory, channel } = fixture()
  try {
    reviewRecord(directory, { independent: false })
    cardFile(directory)
    const result = await channel.dispatch('reviewCards/get', { sessionId: 'changer', turn: 1 })
    assert.equal(result.value.cards.length, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a directory with both records selects the record by the card review kind', async () => {
  const { root, directory, channel } = fixture()
  try {
    reviewRecord(directory, { kind: 'draft', independent: false })
    reviewRecord(directory, { kind: 'apply' })
    const applyPath = cardFile(directory, { review: 'apply', round: 2 })
    cardFile(directory, { review: 'draft', round: 1 })
    const result = await channel.dispatch('reviewCards/get', { sessionId: 'changer', turn: 1 })
    assert.equal(result.value.cards.length, 1)
    assert.equal(result.value.cards[0].review, 'draft')
    assert.equal(JSON.parse(readFileSync(applyPath, 'utf8')).turn, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a pr card selects the pr record', async () => {
  const { root, directory, channel } = fixture()
  try {
    reviewRecord(directory, { kind: 'pr', independent: false })
    const path = cardFile(directory, { review: 'pr', round: 2 })
    const result = await channel.dispatch('reviewCards/get', { sessionId: 'changer', turn: 1 })
    assert.equal(result.value.cards.length, 1)
    assert.equal(result.value.cards[0].review, 'pr')
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).turn, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a card without a review kind compares against the draft record', async () => {
  const { root, directory, channel } = fixture()
  try {
    reviewRecord(directory, { kind: 'draft', independent: false })
    reviewRecord(directory, { kind: 'apply' })
    const path = cardFile(directory)
    const file = JSON.parse(readFileSync(path, 'utf8'))
    delete file.review
    writeFileSync(path, JSON.stringify(file))
    const result = await channel.dispatch('reviewCards/get', { sessionId: 'changer', turn: 1 })
    assert.equal(result.value.cards.length, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a record without changerSessionId keeps delivery', async () => {
  const { root, directory, channel } = fixture()
  try {
    reviewRecord(directory, { changerSessionId: null })
    cardFile(directory)
    const result = await channel.dispatch('reviewCards/get', { sessionId: 'changer', turn: 1 })
    assert.equal(result.value.cards.length, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a corrupt record keeps delivery and logs a warning', async () => {
  const { root, directory, channel, warnings } = fixture()
  try {
    writeFileSync(join(directory, 'review.json'), '{ not json')
    cardFile(directory)
    const result = await channel.dispatch('reviewCards/get', { sessionId: 'changer', turn: 1 })
    assert.equal(result.value.cards.length, 1)
    assert.ok(warnings.some((message) => message.includes('could not be read for card filtering')))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a legacy changer review card is withheld for an independent review', async () => {
  const root = tempDir('dsh-cards-legacy-withhold-')
  const legacy = join(root, 'openspec', '.review', 'local#demo')
  mkdirSync(join(legacy, 'cards'), { recursive: true })
  execFileSync('git', ['-C', root, 'init', '-q'])
  reviewRecord(legacy)
  const path = cardFile(legacy)
  const channel = createReviewChannel({
    ctx: {
      get(name) {
        if (name === 'agents') return { list: () => [{ session: { id: 'changer' } }] }
        if (name === 'workingDirectory') return { get: () => root }
        return undefined
      },
      logger: { warn: () => {} },
    },
    settings: { timeoutMs: 1000, reviews: { draft: {}, apply: {} } },
  })
  try {
    const result = await channel.dispatch('reviewCards/get', { sessionId: 'changer', turn: 1 })
    assert.deepEqual(result.value.cards, [])
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).turn, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('two project roots sharing a review root return each card once', async () => {
  const root = tempDir('dsh-cards-shared-')
  try {
    execFileSync('git', ['-C', root, 'init', '-q'])
    mkdirSync(join(root, 'openspec'), { recursive: true })
    mkdirSync(join(root, 'nested', 'openspec'), { recursive: true })
    const directory = reviewDirectory(root, undefined, 'demo')
    mkdirSync(join(directory, 'cards'), { recursive: true })
    const path = cardFile(directory)
    const listings = []
    const io = {
      readdirSync: (target) => {
        listings.push(target)
        return readdirSync(target)
      },
    }
    const channel = createReviewChannel({
      ctx: {
        get(name) {
          if (name === 'agents') {
            return { list: () => [{ session: { id: 'changer' } }, { session: { id: 'reviewer' } }] }
          }
          if (name === 'workingDirectory') {
            return { get: (agent) => ((agent?.session?.id ?? agent?.id) === 'changer' ? root : join(root, 'nested')) }
          }
          return undefined
        },
        logger: { warn: () => {} },
      },
      settings: { timeoutMs: 1000, reviews: { draft: {}, apply: {} } },
      io,
    })
    const result = await channel.dispatch('reviewCards/get', {
      sessionId: 'changer', turn: 1, from: '2026-01-01T00:00:00.000Z',
    })
    assert.equal(result.value.cards.length, 1)
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).turn, 1)
    assert.equal(listings.filter((target) => target === reviewRoot(root)).length, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('two project roots with different review roots return both cards', async () => {
  const first = fixture()
  const second = tempDir('dsh-cards-other-')
  try {
    mkdirSync(join(second, 'openspec'), { recursive: true })
    const secondDirectory = join(second, 'openspec', '.review', 'local#demo')
    mkdirSync(join(secondDirectory, 'cards'), { recursive: true })
    cardFile(first.directory, { round: 1 })
    cardFile(secondDirectory, { round: 2 })
    const listings = []
    const channel = createReviewChannel({
      ctx: {
        get(name) {
          if (name === 'agents') {
            return { list: () => [{ session: { id: 'changer' } }, { session: { id: 'reviewer' } }] }
          }
          if (name === 'workingDirectory') {
            return { get: (agent) => ((agent?.session?.id ?? agent?.id) === 'changer' ? first.root : second) }
          }
          return undefined
        },
        logger: { warn: () => {} },
      },
      settings: { timeoutMs: 1000, reviews: { draft: {}, apply: {} } },
      io: {
        readdirSync: (target) => {
          listings.push(target)
          return readdirSync(target)
        },
      },
    })
    const result = await channel.dispatch('reviewCards/get', {
      sessionId: 'changer', turn: 1, from: '2026-01-01T00:00:00.000Z',
    })
    assert.equal(result.value.cards.length, 2)
    assert.deepEqual(result.value.cards.map((card) => card.round).sort(), [1, 2])
    assert.equal(listings.filter((target) => target === reviewRoot(first.root)).length, 1)
    assert.equal(listings.filter((target) => target === reviewRoot(second)).length, 1)
  } finally {
    rmSync(first.root, { recursive: true, force: true })
    rmSync(second, { recursive: true, force: true })
  }
})

test('a card file outside the session key is ignored', async () => {
  const { root, directory, channel } = fixture()
  try {
    const foreign = join(directory, 'cards', 'foreign.json')
    writeFileSync(foreign, JSON.stringify({
      schemaVersion: 1,
      sessionId: 'changer',
      phase: 'review',
      round: 1,
      turn: null,
      writtenAt: '2026-01-01T00:00:30.000Z',
      payload: { phase: 'review' },
    }))
    cardFile(directory)
    const result = await channel.dispatch('reviewCards/get', {
      sessionId: 'changer', turn: 1, from: '2026-01-01T00:00:00.000Z',
    })
    assert.equal(result.value.cards.length, 1)
    assert.equal(JSON.parse(readFileSync(foreign, 'utf8')).turn, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a malformed file outside the session key does not fail the request', async () => {
  const { root, directory, channel } = fixture()
  try {
    writeFileSync(join(directory, 'cards', 'other-session.json'), '{not json')
    cardFile(directory)
    const result = await channel.dispatch('reviewCards/get', {
      sessionId: 'changer', turn: 1, from: '2026-01-01T00:00:00.000Z',
    })
    assert.equal(result.value.cards.length, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a batch returns one entry per turn in ascending order', async () => {
  const { root, directory, channel } = fixture()
  try {
    cardFile(directory, { turn: 4, round: 2, writtenAt: '2026-01-01T00:02:00.000Z' })
    cardFile(directory, { turn: 5, round: 3, writtenAt: '2026-01-01T00:03:00.000Z' })
    const result = await channel.dispatch('reviewCards/get', {
      sessionId: 'changer',
      turns: [{ turn: 5 }, { turn: 4 }],
    })
    assert.deepEqual(Object.keys(result.value.byTurn), ['4', '5'])
    assert.equal(result.value.byTurn['4'].length, 1)
    assert.equal(result.value.byTurn['5'].length, 1)
    assert.equal(result.value.byTurn['4'][0].round, 2)
    assert.equal(result.value.byTurn['5'][0].round, 3)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('each batch turn applies its own window', async () => {
  const { root, directory, channel } = fixture()
  try {
    const path = cardFile(directory, { writtenAt: '2026-01-01T00:05:00.000Z' })
    const result = await channel.dispatch('reviewCards/get', {
      sessionId: 'changer',
      turns: [
        { turn: 1, to: '2026-01-01T00:02:00.000Z' },
        { turn: 2, from: '2026-01-01T00:04:00.000Z', to: '2026-01-01T00:10:00.000Z' },
      ],
    })
    assert.deepEqual(result.value.byTurn['1'], [])
    assert.equal(result.value.byTurn['2'].length, 1)
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).turn, 2)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a batch binds unclaimed cards in ascending turn order', async () => {
  const { root, directory, channel } = fixture()
  try {
    const early = cardFile(directory, { round: 1, writtenAt: '2026-01-01T00:01:00.000Z' })
    const late = cardFile(directory, { round: 2, writtenAt: '2026-01-01T00:06:00.000Z' })
    const result = await channel.dispatch('reviewCards/get', {
      sessionId: 'changer',
      turns: [
        { turn: 2, from: '2026-01-01T00:05:00.000Z', to: '2026-01-01T00:10:00.000Z' },
        { turn: 1, from: '2026-01-01T00:00:00.000Z', to: '2026-01-01T00:02:00.000Z' },
      ],
    })
    assert.equal(result.value.byTurn['1'].length, 1)
    assert.equal(result.value.byTurn['2'].length, 1)
    assert.equal(JSON.parse(readFileSync(early, 'utf8')).turn, 1)
    assert.equal(JSON.parse(readFileSync(late, 'utf8')).turn, 2)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a repeated batch turn binds once', async () => {
  const { root, directory, channel } = fixture()
  try {
    const path = cardFile(directory)
    const result = await channel.dispatch('reviewCards/get', {
      sessionId: 'changer',
      turns: [
        { turn: 1, from: '2026-01-01T00:00:00.000Z' },
        { turn: 1, from: '2026-01-01T00:00:00.000Z' },
      ],
    })
    assert.equal(result.value.byTurn['1'].length, 1)
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).turn, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a batch withholds the changer review card and keeps the resolution card', async () => {
  const { root, directory, channel } = fixture()
  try {
    reviewRecord(directory)
    const reviewPath = cardFile(directory, { phase: 'review', round: 1 })
    cardFile(directory, { phase: 'resolution', round: 1 })
    const result = await channel.dispatch('reviewCards/get', {
      sessionId: 'changer',
      turns: [{ turn: 1, from: '2026-01-01T00:00:00.000Z' }, { turn: 2 }],
    })
    const cards = [...result.value.byTurn['1'], ...result.value.byTurn['2']]
    assert.equal(cards.length, 1)
    assert.equal(cards[0].phase, 'resolution')
    assert.equal(JSON.parse(readFileSync(reviewPath, 'utf8')).turn, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a batch rejects more than 64 turns and bad windows', async () => {
  const { root, directory, channel } = fixture()
  try {
    const path = cardFile(directory)
    const tooMany = await channel.dispatch('reviewCards/get', {
      sessionId: 'changer',
      turns: Array.from({ length: 65 }, (_value, index) => ({ turn: index + 1 })),
    })
    assert.equal(tooMany.ok, false)
    assert.equal(tooMany.error.code, 'reviewCards/bad-argument')
    assert.equal(JSON.parse(readFileSync(path, 'utf8')).turn, null)
    const zero = await channel.dispatch('reviewCards/get', {
      sessionId: 'changer', turns: [{ turn: 0 }],
    })
    assert.equal(zero.ok, false)
    const badTo = await channel.dispatch('reviewCards/get', {
      sessionId: 'changer', turns: [{ turn: 1, to: 'not-a-time' }],
    })
    assert.equal(badTo.ok, false)
    assert.match(badTo.error.message, /turn end/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a batch with no turns answers an empty byTurn', async () => {
  const { root, directory, channel } = fixture()
  try {
    const result = await channel.dispatch('reviewCards/get', { sessionId: 'changer', turns: [] })
    assert.deepEqual(result.value.byTurn, {})
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a single-turn answer carries no byTurn object', async () => {
  const { root, directory, channel } = fixture()
  try {
    cardFile(directory)
    const result = await channel.dispatch('reviewCards/get', {
      sessionId: 'changer', turn: 1, from: '2026-01-01T00:00:00.000Z',
    })
    assert.equal(result.value.cards.length, 1)
    assert.equal(Object.prototype.hasOwnProperty.call(result.value, 'byTurn'), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('an unreadable matching card does not fail the batch', async () => {
  const { root, directory, channel } = fixture()
  try {
    writeFileSync(join(directory, 'cards', `${sessionKeyOf('changer')}-corrupt-9.json`), '{not json')
    cardFile(directory)
    const result = await channel.dispatch('reviewCards/get', {
      sessionId: 'changer', turns: [{ turn: 1, from: '2026-01-01T00:00:00.000Z' }],
    })
    assert.equal(result.value.byTurn['1'].length, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a held directory lock keeps the turn entry with the other directories', async () => {
  const { root, channel } = fixture()
  try {
    const first = join(root, 'openspec', '.review', 'local#a')
    const second = join(root, 'openspec', '.review', 'local#b')
    mkdirSync(join(first, 'cards'), { recursive: true })
    mkdirSync(join(second, 'cards'), { recursive: true })
    cardFile(first, { writtenAt: '2026-01-01T00:06:00.000Z' })
    const blocked = cardFile(second)
    mkdirSync(join(second, '.lock'))
    const result = await channel.dispatch('reviewCards/get', {
      sessionId: 'changer',
      turns: [
        { turn: 1, from: '2026-01-01T00:00:00.000Z', to: '2026-01-01T00:02:00.000Z' },
        { turn: 2, from: '2026-01-01T00:05:00.000Z', to: '2026-01-01T00:10:00.000Z' },
      ],
    })
    assert.deepEqual(result.value.byTurn['1'], [])
    assert.equal(result.value.byTurn['2'].length, 1)
    assert.equal(JSON.parse(readFileSync(blocked, 'utf8')).turn, null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a batch leaves the watermark of sequential requests and writes it once', async () => {
  const now = () => Date.parse('2026-01-01T00:30:00.000Z')
  const batch = fixture({ now })
  const sequential = fixture({ now })
  try {
    const writeBatch = []
    batch.channel = createReviewChannel({
      ctx: {
        get(name) {
          if (name === 'agents') return { list: () => [{ session: { id: 'changer' } }] }
          if (name === 'workingDirectory') return { get: () => batch.root }
          return undefined
        },
        logger: { warn: () => {} },
      },
      settings: { timeoutMs: 1000, reviews: { draft: {}, apply: {} } },
      now,
      io: {
        writeJsonAtomic: (target, value) => {
          writeBatch.push(target)
          writeJsonAtomic(target, value)
        },
      },
    })
    cardFile(batch.directory, { round: 1, writtenAt: '2026-01-01T00:05:00.000Z' })
    cardFile(sequential.directory, { round: 1, writtenAt: '2026-01-01T00:05:00.000Z' })
    await batch.channel.dispatch('reviewCards/get', {
      sessionId: 'changer',
      turns: [
        { turn: 1, to: '2026-01-01T00:10:00.000Z' },
        { turn: 2, to: '2026-01-01T00:20:00.000Z' },
      ],
    })
    await sequential.channel.dispatch('reviewCards/get', {
      sessionId: 'changer', turn: 1, to: '2026-01-01T00:10:00.000Z',
    })
    await sequential.channel.dispatch('reviewCards/get', {
      sessionId: 'changer', turn: 2, to: '2026-01-01T00:20:00.000Z',
    })
    const batchDelivery = JSON.parse(readFileSync(join(batch.directory, 'card-delivery.json'), 'utf8'))
    const sequentialDelivery = JSON.parse(readFileSync(join(sequential.directory, 'card-delivery.json'), 'utf8'))
    assert.deepEqual(batchDelivery, sequentialDelivery)
    assert.equal(writeBatch.filter((target) => target.endsWith('card-delivery.json')).length, 1)
  } finally {
    rmSync(batch.root, { recursive: true, force: true })
    rmSync(sequential.root, { recursive: true, force: true })
  }
})

test('an extra round card keeps the sequence ordering', () => {
  const first = { payload: { phase: 'review', round: 1 }, writtenAt: '2026-01-01T00:00:00.000Z' }
  const extra = {
    payload: { phase: 'review', round: 2, roundToken: 'E1' },
    writtenAt: '2026-01-01T00:00:00.000Z',
  }
  assert.ok(compareCards(first, extra) < 0)
  assert.ok(compareCards(extra, first) > 0)
})

test('draft and apply cards coexist for one session and round', async () => {
  const { directory, channel } = fixture()
  try {
    cardFile(directory, { kind: 'draft', writtenAt: '2026-01-01T00:01:00.000Z' })
    cardFile(directory, { kind: 'apply', review: 'apply', writtenAt: '2026-01-01T00:02:00.000Z' })
    const result = await channel.dispatch('reviewCards/get', { sessionId: 'changer', turn: 1 })
    assert.equal(result.value.cards.length, 2)
    assert.deepEqual(result.value.cards.map((card) => card.review), ['draft', 'apply'])
    assert.deepEqual(readdirSync(join(directory, 'cards')).sort(), [
      `${sessionKeyOf('changer')}-apply-review-1.json`,
      `${sessionKeyOf('changer')}-draft-review-1.json`,
    ])
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('a legacy card name without a kind is still delivered', async () => {
  const { directory, channel } = fixture()
  try {
    cardFile(directory, { legacyName: true })
    const result = await channel.dispatch('reviewCards/get', { sessionId: 'changer', turn: 1 })
    assert.equal(result.value.cards.length, 1)
    assert.equal(result.value.cards[0].phase, 'review')
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
