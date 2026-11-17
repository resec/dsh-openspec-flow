/**
 * Review-card records.
 *
 * The review and resolution points build one payload from the stored record,
 * the round report and the plan-change waiver, then commit it with
 * `appendPluginRecord`. The resulting event is an ignorable plugin record, so
 * it never enters the model-visible surface but stays in the session log for
 * the projection and the client card.
 *
 * @module dsh-openspec-flow/review/cards
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { appendPluginRecord } from '@deepseek-ai/dsh-session'
import { summarizeFindings } from './report.js'
import { saveReview } from './record.js'

/** Plugin record type written for a review round. */
export const CARD_EVENT = 'plugin:openspec-flow/review-card'

/** Session projection key the client card reads. */
export const CARD_PROJECTION_KEY = 'openspecReviewCards'

/** Card phases. */
export const CARD_PHASES = ['review', 'resolution']

/**
 * Copy one JSON value with `undefined` replaced by `null` and no non-JSON
 * values left behind.
 * @param value - candidate.
 * @returns the normalized value.
 */
export function normalizeJson(value) {
  if (value === undefined) return null
  if (value === null) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map((entry) => normalizeJson(entry))
  if (typeof value === 'object') {
    const out = {}
    for (const [key, entry] of Object.entries(value)) out[key] = normalizeJson(entry)
    return out
  }
  return null
}

/**
 * Read one round's report file.
 * @param directory - review directory.
 * @param round - round entry.
 * @returns the report object, or null when absent or unreadable.
 */
export function readRoundReport(directory, round) {
  const path = round?.report?.path
  if (typeof path !== 'string' || path === '') return null
  try {
    return JSON.parse(readFileSync(join(directory, path), 'utf8'))
  } catch {
    return null
  }
}

/**
 * The object binding of one card.
 * @param record - review record.
 * @param currentHash - current object hash, when known.
 * @returns the object descriptor.
 */
function objectOf(record, currentHash) {
  const recorded = record.objectHash ?? null
  const current = currentHash ?? recorded
  const changed = recorded !== null && current !== null && recorded !== current
  if (record.review === 'apply') {
    return {
      kind: 'commit',
      commit: record.commitSha ?? null,
      tree: record.treeSha ?? null,
      baseTree: record.baseTreeSha ?? null,
      hash: recorded,
      current,
      changed,
    }
  }
  return { kind: 'change', hash: recorded, current, changed }
}

/**
 * Project one recorded finding into the card payload.
 * @param finding - recorded finding.
 * @returns the payload finding.
 */
function findingOf(finding) {
  return {
    id: finding.id,
    severity: finding.severity,
    axis: finding.axis ?? null,
    location: finding.location,
    title: finding.title,
    status: finding.status,
    note: finding.note ?? null,
    waiver: finding.waiver ?? null,
    approvedBy: finding.approvedBy ?? null,
    firstRound: finding.firstRound ?? null,
    verifiedInRound: finding.verifiedInRound ?? null,
    lastVerification: finding.lastVerification ?? null,
  }
}

/**
 * Build one card payload.
 * @param options - phase, record, kind, round, report, waiver, readiness and
 *   the current object hash.
 * @returns the normalized payload.
 */
export function buildCard(options) {
  const { record, round, report, waiver, readiness } = options
  const roundEntry = (record.rounds ?? []).find((entry) => entry.round === round) ?? {}
  return normalizeJson({
    phase: options.phase,
    change: record.change,
    review: options.kind,
    round,
    verdict: roundEntry.verdict ?? report?.verdict ?? null,
    state: record.state ?? null,
    ready: readiness?.ready === true,
    mode: record.mode ?? null,
    independent: record.independent === true,
    object: objectOf(record, options.currentHash),
    startedAt: roundEntry.startedAt ?? null,
    recordedAt: roundEntry.report?.recordedAt ?? null,
    counts: summarizeFindings(record.findings ?? []),
    report: report ?? null,
    findings: (record.findings ?? []).map(findingOf),
    planChangeWaiver: waiver ?? null,
    nextAction: readiness?.nextAction ?? null,
    readinessReasons: readiness?.reasons ?? [],
  })
}

/**
 * Whether the record already marks a card.
 * @param record - review record.
 * @param marker - session, phase and round.
 * @returns true when marked.
 */
export function hasCardMarker(record, marker) {
  return (record.cards ?? []).some((entry) => entry.sessionId === marker.sessionId
    && entry.phase === marker.phase
    && entry.round === marker.round)
}

/**
 * Append one card marker to the record in memory.
 * @param record - review record.
 * @param marker - session, phase and round.
 * @returns nothing.
 */
export function addCardMarker(record, marker) {
  record.cards = Array.isArray(record.cards) ? record.cards : []
  record.cards.push({ ...marker, at: new Date().toISOString() })
}

/**
 * Commit one card record through the Host Session.
 *
 * A failed write is logged and returns false: the card is a reporting surface,
 * so a failure must not roll back a stored report or a disposal.
 * @param options - session, payload and logger.
 * @returns true when the record was committed.
 */
export function writeCardRecord(options) {
  const { session, payload, logger } = options
  if (session === undefined || session === null) {
    logger?.warn?.('openspec-flow: no Session is available; the review card was skipped')
    return false
  }
  try {
    appendPluginRecord(session, CARD_EVENT, payload)
    return true
  } catch (error) {
    logger?.warn?.(
      `openspec-flow: the review card could not be written: ${error instanceof Error ? error.message : String(error)}`,
    )
    return false
  }
}

/**
 * Write one card once for a session, phase and round.
 *
 * Callers hold the review lock. The marker is stored only after a successful
 * record write, so a failed write can be retried by the next call.
 * @param options - directory, kind, record, round, phase, session, readiness,
 *   report, waiver, current hash and logger.
 * @returns true when the record was committed.
 */
export function writeCard(options) {
  const { directory, kind, record, session } = options
  const sessionId = session?.id
  if (typeof sessionId !== 'string' || sessionId === '') {
    options.logger?.warn?.('openspec-flow: no Session is available; the review card was skipped')
    return false
  }
  const marker = { sessionId, phase: options.phase, round: options.round }
  if (hasCardMarker(record, marker)) return false
  const payload = buildCard(options)
  if (!writeCardRecord({ session, payload, logger: options.logger })) return false
  addCardMarker(record, marker)
  saveReview(directory, record, kind)
  return true
}
