/**
 * Shared report submission for self-review and the independent reviewer.
 *
 * @module dsh-openspec-flow/review/submit
 */

import { join } from 'node:path'
import { writeTextAtomic, sha256 } from './store.js'
import { assertReport, applyVerificationsTo, recordFinding } from './report.js'
import { latestRound, roundPrefix, saveReview } from './record.js'
import { draftReadiness } from './readiness.js'

/**
 * Validate and store one report, then update findings and readiness.
 * @param options - directory, kind, record, report and current object hash.
 * @returns `{ record, readiness }`.
 */
export function submitReport(options) {
  const { directory, kind, record, report, currentHash } = options
  const current = latestRound(record)
  if (current === undefined) throw new Error(`the ${kind} review has no round`)
  if (current.report !== undefined) throw new Error('this round already has a report')
  assertReport(report, { round: current.round, findings: record.findings ?? [] })
  const findings = applyVerificationsTo(
    (record.findings ?? []).map((finding) => ({ ...finding })),
    report.verifications ?? [],
    current.round,
  )
  for (const finding of report.findings) findings.push(recordFinding(finding, current.round))
  record.findings = findings
  const prefix = roundPrefix(kind)
  const reportPath = `${prefix}-${String(current.round)}/report.json`
  const reportText = `${JSON.stringify(report, null, 2)}\n`
  writeTextAtomic(join(directory, reportPath), reportText)
  current.report = {
    path: reportPath,
    sha256: sha256(reportText),
    bytes: Buffer.byteLength(reportText),
    verdict: report.verdict,
    recordedAt: new Date().toISOString(),
  }
  current.verdict = report.verdict
  const readiness = draftReadiness(record, currentHash, kind)
  record.state = readiness.ready ? 'passed' : 'in-review'
  saveReview(directory, record, kind)
  return { record, readiness }
}
