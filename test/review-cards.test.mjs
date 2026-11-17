import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  SESSION_FORMAT_VERSION,
  Session,
} from '@deepseek-ai/dsh-session'
import {
  CARD_EVENT,
  buildCard,
  hasCardMarker,
  normalizeJson,
  readRoundReport,
  writeCard,
} from '../lib/review/cards.js'

/** Build one record for a card test. */
function record(overrides = {}) {
  return {
    change: 'demo',
    review: 'draft',
    state: 'in-review',
    mode: 'self',
    independent: false,
    objectHash: 'hash-a',
    rounds: [{
      round: 1,
      startedAt: '2026-01-01T00:00:00.000Z',
      verdict: 'changes-requested',
      report: {
        path: 'round-1/report.json',
        recordedAt: '2026-01-01T00:01:00.000Z',
      },
    }],
    findings: [{
      id: 'R1-01',
      severity: 'major',
      axis: 'intent',
      location: 'proposal.md:3',
      title: 'Missing goal',
      status: 'open',
      firstRound: 1,
    }],
    ...overrides,
  }
}

/** Build one readiness object. */
function readiness() {
  return { ready: false, nextAction: 'openspec_review action=dispose', reasons: ['R1-01 is open'] }
}

/** Build a detached Session. */
function session(id = 'card-session') {
  return Session.create(id, [], {
    version: SESSION_FORMAT_VERSION,
    id,
    createdAt: Date.now(),
    isSeeded: false,
  })
}

/** Create a review directory holding one report. */
function directory() {
  const root = mkdtempSync(join(tmpdir(), 'dsh-card-'))
  mkdirSync(join(root, 'round-1'), { recursive: true })
  writeFileSync(join(root, 'round-1', 'report.json'), JSON.stringify({
    verdict: 'changes-requested',
    summary: 'One blocker.',
    findings: [{
      id: 'R1-01',
      severity: 'major',
      axis: 'intent',
      location: 'proposal.md:3',
      title: 'Missing goal',
      problem: 'The goal is missing.',
      evidence: 'proposal.md',
      impact: 'The intent cannot be checked.',
      rule: 'Intent fit',
      failure: 'Apply starts without a goal.',
      suggestion: 'Add the goal.',
    }],
    verifications: [],
    outOfScope: ['Not this change.'],
    residualRisks: ['The goal may still be vague.'],
  }))
  return root
}

test('a review card carries the complete report and counts', () => {
  const root = directory()
  try {
    const stored = record()
    const report = readRoundReport(root, stored.rounds[0])
    const card = buildCard({
      phase: 'review',
      kind: 'draft',
      record: stored,
      round: 1,
      report,
      waiver: null,
      readiness: readiness(),
      currentHash: 'hash-b',
    })
    assert.equal(card.phase, 'review')
    assert.equal(card.report.summary, 'One blocker.')
    assert.equal(card.report.findings[0].evidence, 'proposal.md')
    assert.deepEqual(card.report.outOfScope, ['Not this change.'])
    assert.equal(card.findings[0].status, 'open')
    assert.equal(card.counts.total, 1)
    assert.equal(card.object.changed, true)
    assert.equal(card.nextAction, 'openspec_review action=dispose')
    assert.deepEqual(card.readinessReasons, ['R1-01 is open'])
    assert.equal(card.planChangeWaiver, null)
    assert.doesNotThrow(() => JSON.stringify(card))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a resolution card carries dispositions and the waiver', () => {
  const root = directory()
  try {
    const resolved = record({
      findings: [{
        id: 'R1-01',
        severity: 'major',
        axis: 'intent',
        location: 'proposal.md:3',
        title: 'Missing goal',
        status: 'fixed',
        note: 'Added the goal.',
        firstRound: 1,
        verifiedInRound: null,
      }],
    })
    const waiver = {
      text: 'Approved plan change.',
      approvedBy: 'user',
      files: ['proposal.md'],
      recordedAt: '2026-01-01T00:02:00.000Z',
    }
    const card = buildCard({
      phase: 'resolution',
      kind: 'draft',
      record: resolved,
      round: 1,
      report: readRoundReport(root, resolved.rounds[0]),
      waiver,
      readiness: { ready: false, nextAction: 'openspec_review action=resume', reasons: [] },
      currentHash: 'hash-a',
    })
    assert.equal(card.phase, 'resolution')
    assert.equal(card.findings[0].status, 'fixed')
    assert.equal(card.findings[0].note, 'Added the goal.')
    assert.deepEqual(card.planChangeWaiver.files, ['proposal.md'])
    assert.equal(card.object.changed, false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a missing report leaves the recorded fields intact', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-card-missing-'))
  try {
    const stored = record()
    const card = buildCard({
      phase: 'review',
      kind: 'draft',
      record: stored,
      round: 1,
      report: readRoundReport(root, stored.rounds[0]),
      waiver: null,
      readiness: readiness(),
      currentHash: 'hash-a',
    })
    assert.equal(card.report, null)
    assert.equal(card.findings.length, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('undefined values normalize to null and stay JSON safe', () => {
  assert.deepEqual(normalizeJson({ a: undefined, b: [undefined, 1] }), { a: null, b: [null, 1] })
})

test('a card is written once and stays out of the model surface', () => {
  const root = directory()
  const warnings = []
  try {
    const stored = record()
    const target = session()
    const options = {
      directory: root,
      kind: 'draft',
      phase: 'review',
      record: stored,
      round: 1,
      report: readRoundReport(root, stored.rounds[0]),
      waiver: null,
      readiness: readiness(),
      currentHash: 'hash-a',
      session: target,
      logger: { warn: (message) => warnings.push(message) },
    }
    assert.equal(writeCard(options), true)
    assert.equal(stored.cards.length, 1)
    assert.equal(target.log.at(-1).type, CARD_EVENT)
    assert.equal(target.surface.nodes.length, 0)
    assert.equal(hasCardMarker(stored, { sessionId: 'card-session', phase: 'review', round: 1 }), true)

    assert.equal(writeCard(options), false, 'a second write for the same session, phase and round is skipped')
    assert.equal(stored.cards.length, 1)
    assert.equal(warnings.length, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a failed write keeps the marker off and logs', () => {
  const root = directory()
  const warnings = []
  try {
    const stored = record()
    assert.equal(writeCard({
      directory: root,
      kind: 'draft',
      phase: 'review',
      record: stored,
      round: 1,
      report: null,
      waiver: null,
      readiness: readiness(),
      currentHash: 'hash-a',
      session: undefined,
      logger: { warn: (message) => warnings.push(message) },
    }), false)
    assert.equal(stored.cards, undefined)
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /no Session/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
