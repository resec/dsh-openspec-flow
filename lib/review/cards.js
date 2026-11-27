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
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { summarizeFindings } from './report.js'
import { resolveRoundEntry, saveReview } from './record.js'
import { ensureDirectory, writeJsonAtomic } from './store.js'

/** Directory under the review root that holds card files. */
export const CARD_DIR = 'cards'

/** Card phases. */
export const CARD_PHASES = ['review', 'resolution']

/** Legacy review kinds kept for readability of old cards. */
export const CARD_KINDS = ['draft', 'apply']

/** Pattern an entry-name card kind must match. */
const CARD_KIND_PATTERN = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/

/**
 * Whether a value can be a card kind.
 * @param value - candidate.
 * @returns true for a legacy kind or a kebab-case entry name.
 */
export function isCardKind(value) {
  return typeof value === 'string' && CARD_KIND_PATTERN.test(value)
}

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
  if (record.review === 'apply' || record.commitSha !== undefined || record.treeSha !== undefined) {
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
    && entry.round === marker.round
    && (marker.attempt === undefined || (entry.attempt ?? 1) === marker.attempt))
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
 * The file-name suffix of one review attempt.
 *
 * The first attempt keeps the historical name; a refreshed attempt adds its
 * number so the earlier card and its turn binding stay on disk.
 * @param attempt - attempt number, or undefined.
 * @returns `-a<n>` for a later attempt, otherwise an empty string.
 */
function attemptSuffix(attempt) {
  return Number.isInteger(attempt) && attempt > 1 ? `-a${String(attempt)}` : ''
}

/**
 * Path of one card file.
 *
 * The file name carries the review kind, so a marker without a known kind has
 * no path: a name built from `undefined` would silently collide with nothing.
 * @param directory - review directory.
 * @param marker - session, kind, phase, round and optional attempt.
 * @returns the absolute-ish path under the review directory.
 * @throws when the marker carries no known review kind.
 */
export function cardFilePath(directory, marker) {
  if (!isCardKind(marker.kind)) {
    throw new Error(`a review card needs a kebab-case entry name as its kind, got ${String(marker.kind)}`)
  }
  return join(directory, CARD_DIR, `${sessionKeyOf(marker.sessionId)}-${String(marker.kind)}-${marker.phase}-${String(marker.round)}${attemptSuffix(marker.attempt)}.json`)
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
  if (!isCardKind(options.kind)) {
    logger?.warn?.(`openspec-flow: review card skipped; unknown kind ${String(options.kind)}`)
    return false
  }
  const marker = {
    sessionId,
    kind: options.kind,
    phase: options.phase,
    round: options.round,
    ...(options.attempt === undefined ? {} : { attempt: options.attempt }),
  }
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
 * The current attempt number of one review round.
 * @param record - review record.
 * @param round - round number.
 * @returns the 1-based attempt number.
 */
function currentAttempt(record, round) {
  const entry = resolveRoundEntry(record, round)
  return Array.isArray(entry?.revisions) ? entry.revisions.length + 1 : 1
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
  if (!isCardKind(options.kind)) {
    options.logger?.warn?.(`openspec-flow: review card skipped; unknown kind ${String(options.kind)}`)
    return false
  }
  const attempt = options.phase === 'review' ? currentAttempt(options.record, options.round) : undefined
  const marker = {
    sessionId,
    kind: options.kind,
    phase: options.phase,
    round: options.round,
    ...(attempt === undefined ? {} : { attempt }),
  }
  if (hasCardMarker(options.record, marker)) return false
  const payload = buildCard(options)
  if (!writeCardFile({ ...options, payload, attempt })) return false
  addCardMarker(options.record, marker)
  saveReview(options.directory, options.record, options.kind)
  return true
}
