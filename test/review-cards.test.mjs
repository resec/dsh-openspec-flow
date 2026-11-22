import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  buildCard,
  cardFilePath,
  hasCardMarker,
  normalizeJson,
  readRoundReport,
  sessionKeyOf,
  writeCard,
  writeCardFile,
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
  assert.equal(normalizeJson(Number.NaN), null)
  assert.equal(normalizeJson(Symbol('x')), null)
})

test('a card file is written once under a hashed session key', () => {
  const root = directory()
  const warnings = []
  try {
    const stored = record()
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
      session: { id: 'card-session' },
      logger: { warn: (message) => warnings.push(message) },
    }
    assert.equal(writeCard(options), true)
    assert.equal(stored.cards.length, 1)
    const path = cardFilePath(root, { sessionId: 'card-session', kind: 'draft', phase: 'review', round: 1 })
    const file = JSON.parse(readFileSync(path, 'utf8'))
    assert.equal(file.schemaVersion, 1)
    assert.equal(file.sessionId, 'card-session')
    assert.equal(file.sessionKey, sessionKeyOf('card-session'))
    assert.equal(file.turn, null)
    assert.equal(file.payload.phase, 'review')
    assert.equal(file.payload.report.summary, 'One blocker.')
    assert.equal(hasCardMarker(stored, { sessionId: 'card-session', kind: 'draft', phase: 'review', round: 1 }), true)

    assert.equal(writeCard(options), false, 'a second write for the same session, phase and round is skipped')
    assert.equal(stored.cards.length, 1)
    assert.equal(warnings.length, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a failing directory logs and keeps the marker off', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-card-fail-'))
  const warnings = []
  try {
    writeFileSync(join(root, 'cards'), 'not a directory')
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
      session: { id: 'broken' },
      logger: { warn: (message) => warnings.push(message) },
    }), false)
    assert.equal(stored.cards, undefined)
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /could not be written/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a missing session id logs and writes nothing', () => {
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
    assert.match(warnings[0], /no Session/)

    assert.equal(writeCardFile({
      directory: root,
      phase: 'review',
      round: 1,
      payload: {},
      session: {},
      logger: { warn: (message) => warnings.push(message) },
    }), false)
    assert.match(warnings[1], /no Session/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('apply objects name the commit', () => {
  const root = directory()
  try {
    const applied = record({
      review: 'apply',
      commitSha: 'c1',
      treeSha: 't1',
      baseTreeSha: 'b1',
      findings: [],
    })
    const card = buildCard({
      phase: 'review',
      kind: 'apply',
      record: applied,
      round: 1,
      report: null,
      waiver: null,
      readiness: { ready: true, nextAction: 'openspec_archive', reasons: [] },
      currentHash: 't1',
    })
    assert.deepEqual(card.object.kind, 'commit')
    assert.equal(card.object.commit, 'c1')
    assert.equal(card.object.tree, 't1')
    assert.equal(card.object.baseTree, 'b1')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a minimal record and missing report path keep null defaults', () => {
  const root = mkdtempSync(join(tmpdir(), 'dsh-card-minimal-'))
  try {
    const stored = {
      change: 'demo',
      review: 'draft',
      findings: [{ id: 'R1-01', severity: 'minor', location: 'a:1', title: 't', status: 'open' }],
    }
    const card = buildCard({
      phase: 'review',
      kind: 'draft',
      record: stored,
      round: 1,
      report: null,
      waiver: undefined,
      readiness: undefined,
      currentHash: undefined,
    })
    assert.equal(card.verdict, null)
    assert.equal(card.state, null)
    assert.equal(card.mode, null)
    assert.equal(card.startedAt, null)
    assert.equal(card.recordedAt, null)
    assert.equal(card.planChangeWaiver, null)
    assert.equal(card.nextAction, null)
    assert.deepEqual(card.readinessReasons, [])
    assert.equal(card.findings[0].axis, null)
    assert.equal(card.findings[0].firstRound, null)
    assert.deepEqual(readRoundReport(root, {}), null)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a record without findings builds empty counts and a card list', () => {
  const root = directory()
  try {
    const stored = record()
    delete stored.findings
    const card = buildCard({
      phase: 'review',
      kind: 'draft',
      record: stored,
      round: 1,
      report: null,
      waiver: null,
      readiness: readiness(),
      currentHash: 'hash-a',
    })
    assert.equal(card.counts.total, 0)
    assert.deepEqual(card.findings, [])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('a report-level verdict supplies a missing round verdict', () => {
  const root = directory()
  try {
    const stored = record()
    stored.rounds[0].verdict = undefined
    const card = buildCard({
      phase: 'review',
      kind: 'draft',
      record: stored,
      round: 1,
      report: { verdict: 'pass', summary: 'ok', findings: [] },
      waiver: null,
      readiness: readiness(),
      currentHash: 'hash-a',
    })
    assert.equal(card.verdict, 'pass')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('an extra round card uses the sequence and carries the token', () => {
  const stored = record({
    review: 'apply',
    rounds: [{
      round: 1,
      seq: 1,
      startedAt: '2026-01-01T00:00:00.000Z',
      verdict: 'pass',
      report: { path: 'apply-round-1/report.json', recordedAt: '2026-01-01T00:01:00.000Z' },
    }],
    extraRounds: [{
      round: 'E1',
      seq: 2,
      startedAt: '2026-01-02T00:00:00.000Z',
      verdict: 'pass',
      report: { path: 'apply-round-E1/report.json', recordedAt: '2026-01-02T00:01:00.000Z' },
    }],
  })
  const card = buildCard({
    phase: 'review',
    kind: 'apply',
    record: stored,
    round: 2,
    roundToken: 'E1',
    report: { verdict: 'pass' },
    waiver: null,
    readiness: { ready: true, nextAction: 'openspec_apply_worktree action=land', reasons: [] },
    currentHash: 'hash-a',
  })
  assert.equal(card.round, 2)
  assert.equal(card.roundToken, 'E1')
  assert.equal(card.verdict, 'pass')
  assert.equal(card.startedAt, '2026-01-02T00:00:00.000Z')
  assert.equal(card.recordedAt, '2026-01-02T00:01:00.000Z')
})
