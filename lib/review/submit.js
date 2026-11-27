/**
 * Shared report submission for self-review and the independent reviewer.
 *
 * @module dsh-openspec-flow/review/submit
 */

import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { writeTextAtomic, sha256 } from './store.js'
import { assertReport, applyVerificationsTo, recordFinding } from './report.js'
import { entrySeq, latestEntry, roundPrefix, saveReview } from './record.js'
import { draftReadiness } from './readiness.js'
import { disarmRoundWatch } from './watch.js'

/**
 * Validate and store one report, then update findings and readiness.
 *
 * `validateFindingSet: false` validates the report shape without checking the
 * recorded findings. The stale-round close uses it: a `fixed` finding waiting
 * for a later verification must not refuse the blocked report that closes the
 * round. `metadata` is recorded on the round beside the report pointer. A
 * recorded change scopes a new finding's location to that change.
 *
 * @param options - directory, kind, record, report, current object hash,
 *   readiness options, the finding-set switch and round metadata.
 * @returns `{ record, readiness }`.
 */
export function submitReport(options) {
  const {
    directory, kind, record, report, currentHash, readinessOptions,
    validateFindingSet = true, metadata,
  } = options
  const current = latestEntry(record)
  if (current === undefined) throw new Error(`the ${kind} review has no round`)
  if (current.report !== undefined) throw new Error('this round already has a report')
  const seq = entrySeq(current) ?? current.round
  const scope = typeof record.change === 'string' && record.change !== ''
    ? { change: record.change }
    : undefined
  // A blocked directory-entry report records an attempt that produced no review
  // content. Its findings stay in the report file and never enter the finding
  // lifecycle.
  const object = record?.object === 'tree' || record?.objectKind === 'tree' ? 'tree' : 'directory'
  const blockedDraft = object === 'directory' && report.verdict === 'blocked'
  const checkFindingSet = validateFindingSet && !blockedDraft
  assertReport(report, {
    roundToken: current.round,
    seq,
    findings: checkFindingSet ? (record.findings ?? []) : [],
    kind,
    scope,
    passCriteria: record.criteria?.passCriteria ?? 'major',
  })
  if (!blockedDraft) {
    const findings = applyVerificationsTo(
      (record.findings ?? []).map((finding) => ({ ...finding })),
      report.verifications ?? [],
      current.round,
      seq,
    )
    for (const finding of report.findings) findings.push(recordFinding(finding, current.round, seq))
    record.findings = findings
  }
  const prefix = roundPrefix(kind)
  const reportPath = `${prefix}-${String(current.round)}/report.json`
  const reportText = `${JSON.stringify(report, null, 2)}\n`
  mkdirSync(dirname(join(directory, reportPath)), { recursive: true })
  writeTextAtomic(join(directory, reportPath), reportText)
  current.report = {
    path: reportPath,
    sha256: sha256(reportText),
    bytes: Buffer.byteLength(reportText),
    verdict: report.verdict,
    recordedAt: new Date().toISOString(),
  }
  current.verdict = report.verdict
  if (metadata !== undefined) Object.assign(current, metadata)
  const readiness = draftReadiness(record, currentHash, kind, readinessOptions ?? {})
  record.state = readiness.ready ? 'passed' : 'in-review'
  saveReview(directory, record, kind)
  disarmRoundWatch(directory, kind)
  return { record, readiness }
}
