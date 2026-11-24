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
 *   no longer gate; `readyAction` overrides the action returned when ready;
 *   `unwaivedPlanFiles` names the changed plan files the recorded waiver does
 *   not cover, so plan drift gates readiness like an open finding.
 * @returns `{ ready, reasons, nextAction }`.
 */
export function draftReadiness(record, currentObjectHash, kind = 'draft', options = {}) {
  const reasons = []
  const ignoreStale = options.ignoreStale === true
  if (record?.state === 'abandoned') reasons.push('the review was abandoned')
  const latest = latestEntry(record)
  const reviewedHash = latest?.objectHash ?? record?.objectHash
  if (!ignoreStale && reviewedHash !== currentObjectHash) reasons.push('the change artifacts changed since the review started')
  const reportMissing = record?.reviewerWaived === undefined
    && (latest === undefined || latest.report === undefined)
  if (record?.reviewerWaived === undefined) {
    if (latest === undefined || latest.report === undefined) {
      reasons.push('no review report has been recorded')
    } else if (latest.verdict !== 'pass') {
      reasons.push(`the latest report verdict is ${String(latest.verdict)}`)
    }
  }
  const lengthBlocked = record?.review === 'draft'
    && options.applyStarted !== true
    && record?.length?.blocking === true
  if (lengthBlocked) reasons.push('the requirement description gate has a blocking result; edit the artifacts and resume review=draft')
  const executionBlocked = record?.review === 'draft'
    && options.applyStarted !== true
    && record?.execution?.blocking === true
  if (executionBlocked) reasons.push('the draft execution preflight has a blocking result; edit the artifacts and resume review=draft')
  const findings = Array.isArray(record?.findings) ? record.findings : []
  for (const finding of findings) {
    if (finding.status === 'deferred' || finding.status === 'rejected') {
      if (isBlocking(finding.severity)) reasons.push(`blocking ${findingReason(finding)}`)
      continue
    }
    if (!closed(finding)) reasons.push(findingReason(finding))
  }
  // Plan drift sits outside the finding lifecycle: a changed plan file keeps
  // the review not ready until the user waives it or the plan is restored.
  const unwaivedPlanFiles = Array.isArray(options.unwaivedPlanFiles) ? options.unwaivedPlanFiles : []
  for (const path of unwaivedPlanFiles) reasons.push(`the changed plan file ${path} has no user waiver`)
  const ready = reasons.length === 0
  const stale = !ignoreStale && record !== undefined && currentObjectHash !== undefined
    && reviewedHash !== currentObjectHash
  const open = findings.some((finding) => finding.status === 'open')
  const needsRound = !open && (stale || findings.some((finding) => finding.status === 'fixed')
    || lengthBlocked || executionBlocked)
  const reportAction = record?.mode === 'reviewer'
    ? `openspec_review action=wait${kind === 'apply' ? ' review=apply' : ''}`
    : `openspec_review action=self-report${kind === 'apply' ? ' review=apply' : ''}`
  return {
    ready,
    reasons,
    nextAction: ready
      ? (options.readyAction ?? 'openspec_apply_next')
      : open
        ? `openspec_review action=dispose review=${kind}`
        : unwaivedPlanFiles.length > 0
          ? 'openspec_review action=waive scope=plan-change'
          : reportMissing && !stale
            ? reportAction
            : needsRound
              ? `openspec_review action=resume review=${kind}`
              : `openspec_review action=dispose review=${kind}`,
  }
}
