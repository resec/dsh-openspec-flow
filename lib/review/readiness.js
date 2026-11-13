/**
 * Draft review readiness.
 *
 * Readiness is derived from the recorded report, the finding lifecycle and the
 * current artifact hash. A report's own `verdict` is never sufficient: a
 * `pass` with an open blocker or a stale object is not ready.
 *
 * @module dsh-openspec-flow/review/readiness
 */

import { isBlocking } from './report.js'

/**
 * Whether a finding is closed for readiness.
 * @param finding - recorded finding.
 * @returns true when verified or waived with evidence.
 */
function closed(finding) {
  if (finding.status === 'waived') {
    return finding.approvedBy === 'user'
      && typeof finding.waiver === 'string'
      && finding.waiver.trim() !== ''
  }
  if (finding.status === 'verified') {
    return Number.isInteger(finding.verifiedInRound)
      && Number.isInteger(finding.firstRound)
      && finding.verifiedInRound > finding.firstRound
  }
  return false
}

/**
 * Explain why a finding is not closed.
 * @param finding - recorded finding.
 * @returns a diagnostic.
 */
function findingReason(finding) {
  if (finding.status === 'open') return `finding ${finding.id} is open`
  if (finding.status === 'fixed') return `finding ${finding.id} is fixed but not verified in a later round`
  if (finding.status === 'verified') return `finding ${finding.id} is verified without a later verification round`
  if (finding.status === 'waived') return `finding ${finding.id} is waived without a user waiver`
  return `finding ${finding.id} is ${String(finding.status)}`
}

/**
 * Compute draft readiness.
 * @param record - review record.
 * @param currentObjectHash - hash of the artifacts now.
 * @returns `{ ready, reasons, nextAction }`.
 */
export function draftReadiness(record, currentObjectHash) {
  const reasons = []
  if (record?.state === 'abandoned') reasons.push('the review was abandoned')
  if (record?.objectHash !== currentObjectHash) reasons.push('the change artifacts changed since the review started')
  const rounds = Array.isArray(record?.rounds) ? record.rounds : []
  const latest = rounds.at(-1)
  if (record?.reviewerWaived === undefined) {
    if (latest === undefined || latest.report === undefined) {
      reasons.push('no review report has been recorded')
    } else if (latest.verdict !== 'pass') {
      reasons.push(`the latest report verdict is ${String(latest.verdict)}`)
    }
  }
  const findings = Array.isArray(record?.findings) ? record.findings : []
  for (const finding of findings) {
    if (finding.status === 'deferred' || finding.status === 'rejected') {
      if (isBlocking(finding.severity)) reasons.push(`blocking ${findingReason(finding)}`)
      continue
    }
    if (!closed(finding)) reasons.push(findingReason(finding))
  }
  const ready = reasons.length === 0
  return {
    ready,
    reasons,
    nextAction: ready
      ? 'openspec_apply_next'
      : findings.some((finding) => finding.status === 'fixed')
        ? 'next review round'
        : 'openspec_review action=dispose',
  }
}
