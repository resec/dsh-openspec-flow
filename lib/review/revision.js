/**
 * Round revision archive for the draft review.
 *
 * A draft attempt that produced no substantive review is replaced by a refresh
 * of the same round. Before the refresh, the attempt's brief, optional blocked
 * report and hashes are copied under `round-N/revisions/MM/` so the audit stays
 * readable after the current round moves on.
 *
 * @module dsh-openspec-flow/review/revision
 */

import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { appendRevision, nextRevisionNumber, revisionDirName, roundPrefix } from './record.js'
import { sha256, writeTextAtomic } from './store.js'

/** Causes an archived draft attempt can carry. */
export const ATTEMPT_CAUSES = ['object-changed', 'blocked-report']

/**
 * Copy one recorded file into the revision directory and describe the copy.
 * @param options - review directory, source pointer, relative target and extra facts.
 * @returns the stored pointer.
 */
function copyPointer(options) {
  const { directory, source, target, extra } = options
  const from = join(directory, source.path)
  const to = join(directory, ...target.split('/'))
  copyFileSync(from, to)
  const bytes = readFileSync(to)
  return {
    path: target,
    sha256: source.sha256 ?? sha256(bytes),
    bytes: source.bytes ?? bytes.length,
    ...extra,
  }
}

/**
 * Archive the current draft attempt and clear its current-round pointers.
 *
 * The round keeps its number and its `revisions` array. `report`, `verdict`
 * and the stale-object cause move to the revision, so readiness and later
 * resumes see an attempt without a substantive report.
 *
 * @param options - review directory, round entry, the attempt cause and an
 *   optional notice snapshot; the round's `staleNotice` is used when omitted.
 * @returns the appended revision.
 * @throws when the cause is unknown or a recorded file is missing.
 */
export function archiveDraftAttempt(options) {
  const { directory, round, cause, notice, kind = 'draft' } = options
  if (round === null || typeof round !== 'object') throw new Error('the draft review has no round attempt')
  if (!ATTEMPT_CAUSES.includes(cause)) {
    throw new Error(`unknown draft attempt cause '${String(cause)}'; use ${ATTEMPT_CAUSES.join(' or ')}`)
  }
  const number = nextRevisionNumber(round)
  const root = `${roundPrefix(kind)}-${String(round.round)}/revisions/${revisionDirName(number)}`
  mkdirSync(join(directory, ...root.split('/')), { recursive: true })
  const revision = {
    revision: number,
    objectHash: round.objectHash,
    artifactHash: round.artifactHash,
    artifactFiles: Array.isArray(round.artifactFiles) ? [...round.artifactFiles] : [],
    cause,
    archivedAt: new Date().toISOString(),
  }
  if (round.brief !== undefined) {
    revision.brief = copyPointer({
      directory,
      source: round.brief,
      target: `${root}/brief.md`,
    })
  }
  if (round.report !== undefined) {
    revision.report = copyPointer({
      directory,
      source: round.report,
      target: `${root}/report.json`,
      extra: {
        verdict: round.report.verdict,
        recordedAt: round.report.recordedAt,
      },
    })
  }
  if (round.blockedReason !== undefined) revision.blockedReason = round.blockedReason
  if (round.staleFrom !== undefined) revision.staleFrom = round.staleFrom
  if (round.staleTo !== undefined) revision.staleTo = round.staleTo
  const snapshot = notice ?? round.staleNotice
  if (snapshot !== undefined) revision.notice = { ...snapshot }
  writeTextAtomic(
    join(directory, ...`${root}/meta.json`.split('/')),
    `${JSON.stringify(revision, null, 2)}\n`,
  )
  appendRevision(round, revision)
  delete round.report
  delete round.verdict
  delete round.blockedReason
  delete round.staleFrom
  delete round.staleTo
  round.refreshedAt = revision.archivedAt
  return revision
}
