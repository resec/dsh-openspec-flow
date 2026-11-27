/**
 * Draft review readiness.
 *
 * Readiness is derived from the recorded report, the finding lifecycle and the
 * current artifact hash. A report's own `verdict` is never sufficient: a
 * `pass` with an open blocker or a stale object is not ready.
 *
 * @module dsh-openspec-flow/review/readiness
 */

import { latestEntry } from './record.js'
import { isBlocking } from './report.js'

/** The review object a record binds, from the record or its legacy object kind. */
function reviewObject(record) {
  if (record?.object === 'tree' || record?.object === 'directory') return record.object
  if (record?.objectKind === 'tree' || record?.review === 'apply') return 'tree'
  return 'directory'
}

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
 * @param kind - review kind, used in the next action.
 * @param options - `ignoreStale` drops the artifact-hash reason (apply started);
 *   `applyStarted` marks the draft frozen so the length and execution results
 *   no longer gate; `readyAction` overrides the action returned when ready.
 * @returns `{ ready, reasons, nextAction }`.
 */
export function draftReadiness(record, currentObjectHash, kind = 'draft', options = {}) {
  const reasons = []
  const ignoreStale = options.ignoreStale === true
  if (record?.state === 'abandoned') reasons.push('the review was abandoned')
  const latest = latestEntry(record)
  const reviewedHash = latest?.objectHash ?? record?.objectHash
  if (!ignoreStale && reviewedHash !== currentObjectHash) reasons.push('the change artifacts changed since the review started')
  // A blocked draft report is an unreported attempt: it states that no review
  // could be performed, so readiness must not treat it as the round's report.
  const object = reviewObject(record)
  const blockedAttempt = object === 'directory' && latest?.report !== undefined
    && latest?.verdict === 'blocked'
  const reportMissing = record?.reviewerWaived === undefined
    && (latest === undefined || latest.report === undefined || blockedAttempt)
  if (record?.reviewerWaived === undefined) {
    if (reportMissing) {
      reasons.push('no review report has been recorded')
    } else if (latest.verdict !== 'pass') {
      reasons.push(`the latest report verdict is ${String(latest.verdict)}`)
    }
  }
  const lengthBlocked = object === 'directory'
    && options.applyStarted !== true
    && record?.length?.blocking === true
  if (lengthBlocked) reasons.push(`the requirement description gate has a blocking result; edit the artifacts and resume review=${kind}`)
  const executionBlocked = object === 'directory'
    && options.applyStarted !== true
    && record?.execution?.blocking === true
  if (executionBlocked) reasons.push(`the ${kind} execution preflight has a blocking result; edit the artifacts and resume review=${kind}`)
  const findings = Array.isArray(record?.findings) ? record.findings : []
  for (const finding of findings) {
    if (finding.status === 'deferred' || finding.status === 'rejected') {
      if (isBlocking(finding.severity)) reasons.push(`blocking ${findingReason(finding)}`)
      continue
    }
    if (!closed(finding)) reasons.push(findingReason(finding))
  }
  const ready = reasons.length === 0
  const stale = !ignoreStale && record !== undefined && currentObjectHash !== undefined
    && reviewedHash !== currentObjectHash
  const open = findings.some((finding) => finding.status === 'open')
  const needsRound = !open && (stale || findings.some((finding) => finding.status === 'fixed')
    || lengthBlocked || executionBlocked)
  const reportArg = kind === 'draft' ? '' : ` review=${kind}`
  const explicitArg = ` review=${kind}`
  const reportAction = record?.mode === 'reviewer'
    ? `openspec_review action=wait${reportArg}`
    : `openspec_review action=self-report${reportArg}`
  return {
    ready,
    reasons,
    nextAction: ready
      ? (options.readyAction ?? (object === 'tree' ? 'openspec_archive' : 'openspec_apply_next'))
      : open
        ? `openspec_review action=dispose${explicitArg}`
        : blockedAttempt
          ? `openspec_review action=resume${explicitArg}`
          : reportMissing && !stale
            ? reportAction
            : needsRound
              ? `openspec_review action=resume${explicitArg}`
              : `openspec_review action=dispose${explicitArg}`,
  }
}
