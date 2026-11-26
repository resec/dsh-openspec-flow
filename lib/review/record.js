/**
 * Shared review record access.
 *
 * Draft and apply reviews use separate files in the same review directory so a
 * change can carry both records without one overwriting the other.
 *
 * @module dsh-openspec-flow/review/record
 */

import { join } from 'node:path'
import { readJson, writeJsonAtomic } from './store.js'

/** Draft record file. */
export const DRAFT_REVIEW_FILE = 'review.json'

/** Apply record file. */
export const APPLY_REVIEW_FILE = 'apply-review.json'

/**
 * The record file name for one kind.
 * @param kind - `draft` or `apply`.
 * @returns the file name.
 */
export function reviewFile(kind) {
  return kind === 'apply' ? APPLY_REVIEW_FILE : DRAFT_REVIEW_FILE
}

/**
 * The artifact directory prefix for one kind.
 * @param kind - review kind.
 * @returns `round` or `apply-round`.
 */
export function roundPrefix(kind) {
  return kind === 'apply' ? 'apply-round' : 'round'
}

/**
 * Read one review record.
 * @param directory - review directory.
 * @param kind - review kind.
 * @returns the record, or undefined.
 */
export function readReview(directory, kind = 'draft') {
  return readJson(join(directory, reviewFile(kind)))
}

/**
 * Save one review record.
 * @param directory - review directory.
 * @param record - record.
 * @param kind - review kind.
 * @returns nothing.
 */
export function saveReview(directory, record, kind = 'draft') {
  record.updatedAt = new Date().toISOString()
  writeJsonAtomic(join(directory, reviewFile(kind)), record)
}

/**
 * The latest normal round of a record.
 * @param record - review record.
 * @returns the last normal round, or undefined.
 */
export function latestRound(record) {
  return Array.isArray(record?.rounds) ? record.rounds.at(-1) : undefined
}

/**
 * Parse a normal round number or an extra round token.
 * @param value - candidate round argument.
 * @returns `{ kind, number, token }`, or undefined when unsupported.
 */
export function parseRoundToken(value) {
  if (Number.isInteger(value) && value >= 1) return { kind: 'normal', number: value, token: value }
  if (typeof value === 'string') {
    const match = /^E([1-9]\d*)$/u.exec(value)
    if (match !== null) return { kind: 'extra', number: Number(match[1]), token: value }
  }
  return undefined
}

/**
 * The numeric sequence of a round entry.
 * @param entry - round entry.
 * @returns the sequence, or undefined.
 */
export function entrySeq(entry) {
  if (Number.isInteger(entry?.seq)) return entry.seq
  if (Number.isInteger(entry?.round)) return entry.round
  if (typeof entry?.round === 'string') {
    const match = /^E([1-9]\d*)$/u.exec(entry.round)
    if (match !== null) return 1_000_000 + Number(match[1])
  }
  return undefined
}

/**
 * Every round entry of a record, ordered by sequence.
 * @param record - review record.
 * @returns the entries.
 */
export function roundEntries(record) {
  const entries = [
    ...(Array.isArray(record?.rounds) ? record.rounds : []),
    ...(Array.isArray(record?.extraRounds) ? record.extraRounds : []),
  ]
  return entries.sort((left, right) => (entrySeq(left) ?? 0) - (entrySeq(right) ?? 0))
}

/**
 * The latest round entry across normal and extra rounds.
 * @param record - review record.
 * @returns the latest entry, or undefined.
 */
export function latestEntry(record) {
  return roundEntries(record).at(-1)
}

/**
 * The next sequence number for a new round.
 * @param record - review record.
 * @returns the next sequence.
 */
export function nextRoundSeq(record) {
  const entries = roundEntries(record)
  if (entries.length === 0) return 1
  return (entrySeq(entries.at(-1)) ?? entries.length) + 1
}

/**
 * Resolve a requested round token to its entry.
 * @param record - review record.
 * @param value - a normal round number or an extra round token.
 * @returns the entry, or undefined.
 */
export function resolveRoundEntry(record, value) {
  const parsed = parseRoundToken(value)
  if (parsed === undefined) return undefined
  const entries = parsed.kind === 'extra'
    ? (Array.isArray(record?.extraRounds) ? record.extraRounds : [])
    : (Array.isArray(record?.rounds) ? record.rounds : [])
  return entries.find((entry) => entry.round === parsed.token)
}

/**
 * The latest extra round.
 * @param record - review record.
 * @returns the last extra round, or undefined.
 */
export function latestExtraRound(record) {
  return Array.isArray(record?.extraRounds) ? record.extraRounds.at(-1) : undefined
}

/**
 * The recorded revisions of one round.
 * @param round - round entry.
 * @returns the revisions array, empty when none was recorded.
 */
export function roundRevisions(round) {
  return Array.isArray(round?.revisions) ? round.revisions : []
}

/**
 * The next revision number of one round.
 * @param round - round entry.
 * @returns the 1-based revision number.
 */
export function nextRevisionNumber(round) {
  return roundRevisions(round).length + 1
}

/**
 * Append one revision to a round.
 * @param round - round entry.
 * @param revision - revision record.
 * @returns the appended revision.
 */
export function appendRevision(round, revision) {
  round.revisions = roundRevisions(round)
  round.revisions.push(revision)
  return revision
}

/**
 * The two-digit directory name of one revision.
 * @param number - revision number.
 * @returns the padded name.
 */
export function revisionDirName(number) {
  return String(number).padStart(2, '0')
}
