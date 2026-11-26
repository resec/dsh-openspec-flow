/**
 * Review-card files.
 *
 * A review round writes one JSON file under the change's review directory. The
 * file is rendered by the client through the review channel; nothing is
 * appended to the Session log and no DSH package is imported.
 *
 * @module dsh-openspec-flow/review/cards
 */

import { createHash } from 'node:crypto'
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { summarizeFindings } from './report.js'
import { resolveRoundEntry, saveReview } from './record.js'
import { ensureDirectory, writeJsonAtomic } from './store.js'

/** Directory under the review root that holds card files. */
export const CARD_DIR = 'cards'

/** Card phases. */
export const CARD_PHASES = ['review', 'resolution']

/** Review kinds a card file name carries. */
export const CARD_KINDS = ['draft', 'apply']

/**
 * Short, path-safe key for one session id.
 * @param sessionId - session id.
 * @returns the hex key.
 */
export function sessionKeyOf(sessionId) {
  return createHash('sha256').update(sessionId).digest('hex').slice(0, 16)
}

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
  const roundEntry = (options.roundToken === undefined
    ? (record.rounds ?? []).find((entry) => entry.round === round)
    : resolveRoundEntry(record, options.roundToken)) ?? {}
  return normalizeJson({
    phase: options.phase,
    change: record.change,
    review: options.kind,
    round,
    ...(typeof options.roundToken === 'string' ? { roundToken: options.roundToken } : {}),
    verdict: roundEntry.verdict ?? report?.verdict ?? null,
    state: record.state ?? null,
    ready: readiness?.ready === true,
    mode: record.mode ?? null,
    independent: record.independent === true,
    object: objectOf(record, options.currentHash),
    startedAt: roundEntry.startedAt ?? null,
    recordedAt: roundEntry.report?.recordedAt ?? null,
    counts: summarizeFindings(record.findings ?? []),
    ...(report === undefined || report === null ? {} : { report }),
    findings: (record.findings ?? []).map(findingOf),
    planChangeWaiver: waiver ?? null,
    nextAction: readiness?.nextAction ?? null,
    readinessReasons: readiness?.reasons ?? [],
  })
}

/**
 * Whether the record already marks a card.
 * @param record - review record.
 * @param marker - session, kind, phase and round.
 * @returns true when marked.
 */
export function hasCardMarker(record, marker) {
  return (record.cards ?? []).some((entry) => entry.sessionId === marker.sessionId
    && (entry.kind ?? marker.kind) === marker.kind
    && entry.phase === marker.phase
    && entry.round === marker.round)
}

/**
 * Append one card marker to the record in memory.
 * @param record - review record.
 * @param marker - session, kind, phase and round.
 * @returns nothing.
 */
export function addCardMarker(record, marker) {
  record.cards = Array.isArray(record.cards) ? record.cards : []
  record.cards.push({ ...marker, at: new Date().toISOString() })
}

/**
 * Remove the review card markers and files of one round attempt.
 *
 * A refreshed draft round must let the next report write its own card. The
 * caller holds the review lock; a missing file is not an error.
 * @param directory - review directory.
 * @param record - review record, updated in memory.
 * @param options - review kind, phase and round to clear.
 * @returns nothing.
 */
export function clearRoundCards(directory, record, options) {
  const kept = []
  const markers = Array.isArray(record.cards) ? record.cards : []
  for (const marker of markers) {
    const kind = marker.kind ?? options.kind
    const same = kind === options.kind && marker.phase === options.phase
      && marker.round === options.round
    if (!same) {
      kept.push(marker)
      continue
    }
    try {
      rmSync(cardFilePath(directory, marker), { force: true })
    } catch {
      // A card file that is already gone needs no cleanup.
    }
  }
  record.cards = kept
}

/**
 * Path of one card file.
 *
 * The file name carries the review kind, so a marker without a known kind has
 * no path: a name built from `undefined` would silently collide with nothing.
 * @param directory - review directory.
 * @param marker - session, kind, phase and round.
 * @returns the absolute-ish path under the review directory.
 * @throws when the marker carries no known review kind.
 */
export function cardFilePath(directory, marker) {
  if (!CARD_KINDS.includes(marker.kind)) {
    throw new Error(`a review card needs a kind of ${CARD_KINDS.join(' or ')}, got ${String(marker.kind)}`)
  }
  return join(directory, CARD_DIR, `${sessionKeyOf(marker.sessionId)}-${String(marker.kind)}-${marker.phase}-${String(marker.round)}.json`)
}

/**
 * Write one card file atomically.
 *
 * Callers hold the review lock. A failed write is logged; the card is a
 * reporting surface and must not roll back a stored report or a disposal.
 * @param options - directory, session, kind, phase, round, payload and logger.
 * @returns true when the file was written.
 */
export function writeCardFile(options) {
  const { directory, session, payload, logger } = options
  const sessionId = session?.id
  if (typeof sessionId !== 'string' || sessionId === '') {
    logger?.warn?.('openspec-flow: no Session is available; the review card was skipped')
    return false
  }
  if (!CARD_KINDS.includes(options.kind)) {
    logger?.warn?.(`openspec-flow: review card skipped; unknown kind ${String(options.kind)}`)
    return false
  }
  const marker = { sessionId, kind: options.kind, phase: options.phase, round: options.round }
  const path = cardFilePath(directory, marker)
  try {
    ensureDirectory(join(directory, CARD_DIR))
    writeJsonAtomic(path, {
      schemaVersion: 1,
      sessionId,
      sessionKey: sessionKeyOf(sessionId),
      change: payload.change,
      review: payload.review,
      phase: options.phase,
      round: options.round,
      turn: null,
      writtenAt: new Date().toISOString(),
      payload,
    })
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
 * file write, so a failed write can be retried by the next call.
 * @param options - directory, kind, record, round, phase, session, readiness,
 *   report, waiver, current hash and logger.
 * @returns true when the card was written.
 */
export function writeCard(options) {
  const sessionId = options.session?.id
  if (typeof sessionId !== 'string' || sessionId === '') {
    options.logger?.warn?.('openspec-flow: no Session is available; the review card was skipped')
    return false
  }
  if (!CARD_KINDS.includes(options.kind)) {
    options.logger?.warn?.(`openspec-flow: review card skipped; unknown kind ${String(options.kind)}`)
    return false
  }
  const marker = { sessionId, kind: options.kind, phase: options.phase, round: options.round }
  if (hasCardMarker(options.record, marker)) return false
  const payload = buildCard(options)
  if (!writeCardFile({ ...options, payload })) return false
  addCardMarker(options.record, marker)
  saveReview(options.directory, options.record, options.kind)
  return true
}
