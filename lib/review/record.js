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
 * The latest round of a record.
 * @param record - review record.
 * @returns the last round, or undefined.
 */
export function latestRound(record) {
  return Array.isArray(record?.rounds) ? record.rounds.at(-1) : undefined
}
