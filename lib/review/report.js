/**
 * Draft review report validation and finding transitions.
 *
 * The report shape is the same one the later independent reviewer will submit;
 * this change only lets the changer write it. Validation is deliberately
 * strict: a report is stored once, and readiness is derived from it rather than
 * trusted from its `verdict`.
 *
 * @module dsh-openspec-flow/review/report
 */

import { anotherChangeInLocation } from './scope.js'

/** Finding severities, in report order. */
export const SEVERITIES = ['critical', 'major', 'minor', 'nit']

/** Review axes accepted from a report. */
export const AXES = ['intent', 'coherence', 'spec-conflict', 'standards', 'feasibility', 'quality']

/** Verdicts a report may carry. */
export const VERDICTS = ['pass', 'changes-requested', 'blocked']

/** Verification statuses. */
export const VERIFICATION_STATUSES = [
  'verified-fixed', 'verified-deferred', 'verified-rejected', 'still-open', 'regressed',
]

/** Finding statuses, in lifecycle order. */
export const FINDING_STATUSES = [
  'open', 'fixed', 'verified', 'verified-deferred', 'verified-rejected',
  'deferred', 'rejected', 'waived',
]

/** Terminal statuses that count as resolved. */
export const RESOLVED_STATUSES = ['verified', 'verified-deferred', 'verified-rejected', 'waived']

/** Severities that block readiness under the legacy default criterion. */
export const BLOCKING = ['critical', 'major']

/**
 * Whether a severity blocks readiness under the legacy default criterion.
 * @param severity - finding severity.
 * @returns true for critical or major.
 */
export function isBlocking(severity) {
  return BLOCKING.includes(severity)
}

/**
 * Whether a severity is at or above one pass criterion.
 * @param severity - finding severity.
 * @param passCriteria - configured severity floor.
 * @returns true when the finding is in threshold.
 */
export function severityInThreshold(severity, passCriteria = 'major') {
  const severityRank = SEVERITIES.indexOf(severity)
  const criteriaRank = SEVERITIES.indexOf(passCriteria)
  return severityRank !== -1 && criteriaRank !== -1 && severityRank <= criteriaRank
}

/**
 * Require a non-empty string.
 * @param value - candidate.
 * @param label - diagnostic label.
 * @returns the string.
 * @throws when invalid.
 */
function text(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`)
  }
  return value
}

/**
 * The finding id prefix for a round token.
 * @param roundToken - a normal round number or an extra round token.
 * @returns `R<round>` or `E<n>`.
 */
export function findingIdPrefix(roundToken) {
  return typeof roundToken === 'string' && roundToken.startsWith('E')
    ? roundToken
    : `R${String(roundToken)}`
}

/**
 * Validate one reported finding.
 * @param finding - candidate.
 * @param roundToken - current round token.
 * @param index - position for diagnostics.
 * @returns nothing.
 */
function assertFinding(finding, roundToken, index) {
  if (finding === null || typeof finding !== 'object' || Array.isArray(finding)) {
    throw new Error(`findings[${String(index)}] is not an object`)
  }
  const id = String(finding.id ?? '')
  const prefix = findingIdPrefix(roundToken)
  if (!new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-\\d{2}$`, 'u').test(id)) {
    throw new Error(`finding id '${id}' must match ${prefix}-NN`)
  }
  if (!SEVERITIES.includes(finding.severity)) throw new Error(`finding ${id} has an unknown severity`)
  if (!AXES.includes(finding.axis)) throw new Error(`finding ${id} has an unknown axis`)
  for (const field of ['location', 'title', 'problem', 'evidence', 'suggestion']) {
    text(finding[field], `finding ${id} ${field}`)
  }
  if (isBlocking(finding.severity)) {
    for (const field of ['impact', 'rule', 'failure']) {
      text(finding[field], `finding ${id} ${field}`)
    }
  }
}

/**
 * Validate a verifications array against existing findings.
 * @param verifications - candidate array.
 * @param findings - findings before this report.
 * @param kind - review kind, named in the refusal message.
 * @returns nothing.
 */
function assertVerifications(verifications, findings, kind) {
  if (verifications === undefined) return
  if (!Array.isArray(verifications)) throw new Error('verifications must be an array')
  const byId = new Map(findings.map((finding) => [finding.id, finding]))
  const seen = new Set()
  for (const [index, verification] of verifications.entries()) {
    if (verification === null || typeof verification !== 'object' || Array.isArray(verification)) {
      throw new Error(`verifications[${String(index)}] is not an object`)
    }
    const id = String(verification.id ?? '')
    if (id === '') throw new Error(`verifications[${String(index)}] has no id`)
    if (seen.has(id)) throw new Error(`verification for ${id} appears more than once`)
    seen.add(id)
    if (!VERIFICATION_STATUSES.includes(verification.status)) {
      throw new Error(`verification for ${id} has an unknown status`)
    }
    text(verification.evidence, `verification for ${id} evidence`)
    const finding = byId.get(id)
    if (finding === undefined) throw new Error(`verification names unknown finding ${id}`)
    const closedStatuses = ['verified', 'verified-deferred', 'verified-rejected', 'waived']
    if (verification.status === 'verified-fixed' && finding.status !== 'fixed') {
      if (closedStatuses.includes(finding.status)) {
        throw new Error(`finding ${id} is already ${finding.status} and closed, so it cannot be verified-fixed again`)
      }
      throw new Error(`finding ${id} is ${finding.status}, not fixed; the changer must dispose it with openspec_review action=dispose review=${kind} status=fixed and a note before a later round can verify it as verified-fixed`)
    }
    if (verification.status === 'verified-deferred' && finding.status !== 'deferred') {
      if (closedStatuses.includes(finding.status)) {
        throw new Error(`finding ${id} is already ${finding.status} and closed, so it cannot be verified-deferred again`)
      }
      throw new Error(`finding ${id} is ${finding.status}, not deferred; the changer must dispose it with openspec_review action=dispose review=${kind} status=deferred and a note before a later round can verify it as verified-deferred`)
    }
    if (verification.status === 'verified-rejected' && finding.status !== 'rejected') {
      if (closedStatuses.includes(finding.status)) {
        throw new Error(`finding ${id} is already ${finding.status} and closed, so it cannot be verified-rejected again`)
      }
      throw new Error(`finding ${id} is ${finding.status}, not rejected; the changer must dispose it with openspec_review action=dispose review=${kind} status=rejected and a note before a later round can verify it as verified-rejected`)
    }
  }
  for (const finding of findings) {
    if (finding.status === 'fixed' && !seen.has(finding.id)) {
      throw new Error(`finding ${finding.id} is fixed and needs a verification`)
    }
  }
}

/**
 * Validate one report.
 * @param report - candidate report.
 * @param options - current round, findings before this report, the review kind
 *   and the optional change scope.
 * @returns nothing.
 * @throws when the report is malformed or its verdict contradicts its findings.
 */
export function assertReport(report, options) {
  if (report === null || typeof report !== 'object' || Array.isArray(report)) {
    throw new Error('report must be an object')
  }
  if (!VERDICTS.includes(report.verdict)) throw new Error('report.verdict is unknown')
  text(report.summary, 'report.summary')
  if (!Array.isArray(report.findings)) throw new Error('report.findings must be an array')
  const ids = new Set()
  for (const [index, finding] of report.findings.entries()) {
    assertFinding(finding, options.roundToken ?? options.round, index)
    if (ids.has(finding.id)) throw new Error(`finding ${finding.id} appears more than once`)
    ids.add(finding.id)
  }
  if (options.scope?.change !== undefined) {
    for (const finding of report.findings) {
      const other = anotherChangeInLocation(finding.location, options.scope.change)
      if (other !== undefined) {
        throw new Error(`finding ${finding.id} location '${finding.location}' names another change (${other}); record a concern about another change in report.outOfScope instead`)
      }
    }
  }
  for (const field of ['outOfScope', 'residualRisks']) {
    const value = report[field]
    if (value === undefined) continue
    if (!Array.isArray(value)) throw new Error(`report.${field} must be an array`)
    for (const entry of value) text(entry, `report.${field} entry`)
  }
  assertVerifications(report.verifications, options.findings, options.kind ?? 'draft')

  const after = applyVerificationsTo(
    options.findings.map((finding) => ({ ...finding })),
    report.verifications ?? [],
    options.roundToken ?? options.round,
    options.seq ?? options.round,
  )
  const all = [...after, ...report.findings.map((finding) => ({ ...finding, status: 'open' }))]
  const passCriteria = options.passCriteria ?? 'major'
  const blockers = all.filter((finding) => severityInThreshold(finding.severity, passCriteria)
    && !RESOLVED_STATUSES.includes(finding.status))
  if (report.verdict === 'pass' && blockers.length > 0) {
    throw new Error(`a pass verdict has unresolved findings at or above pass criteria ${passCriteria}: ${blockers.map((finding) => finding.id).join(', ')}`)
  }
  if (report.verdict === 'changes-requested' && blockers.length === 0) {
    throw new Error(`a changes-requested verdict needs an unresolved finding at or above pass criteria ${passCriteria}`)
  }
}

/**
 * Apply one verification to a finding.
 * @param finding - finding to update.
 * @param verification - verification entry.
 * @param roundToken - current round token.
 * @param seq - current round sequence.
 * @param now - timestamp.
 * @returns the updated finding.
 */
function applyVerification(finding, verification, roundToken, seq, now) {
  const verifiedStatus = {
    'verified-fixed': 'verified',
    'verified-deferred': 'verified-deferred',
    'verified-rejected': 'verified-rejected',
  }[verification.status]
  if (verifiedStatus !== undefined) {
    finding.status = verifiedStatus
    finding.verifiedInRound = seq
    finding.verifiedInRoundToken = roundToken
    finding.verifiedAt = now
    delete finding.lastVerification
  } else {
    finding.status = 'open'
    finding.lastVerification = verification.status
    delete finding.verifiedInRound
    delete finding.verifiedInRoundToken
    delete finding.verifiedAt
  }
  return finding
}

/**
 * Apply verifications to a copy of findings.
 * @param findings - findings before the report.
 * @param verifications - verified entries.
 * @param roundToken - current round token.
 * @param seq - current round sequence.
 * @param now - timestamp.
 * @returns updated findings.
 */
export function applyVerificationsTo(findings, verifications, roundToken, seq, now = new Date().toISOString()) {
  for (const verification of verifications) {
    const finding = findings.find((candidate) => candidate.id === verification.id)
    if (finding !== undefined) applyVerification(finding, verification, roundToken, seq, now)
  }
  return findings
}

/**
 * Dispose one finding.
 * @param finding - recorded finding.
 * @param options - disposition fields.
 * @returns the finding.
 * @throws when the disposition violates the protocol.
 */
export function disposeFinding(finding, options) {
  const status = options.status
  if (!['fixed', 'deferred', 'rejected', 'waived'].includes(status)) {
    throw new Error('status must be fixed, deferred, rejected or waived')
  }
  if (status === 'fixed' && (typeof options.note !== 'string' || options.note.trim() === '')) {
    throw new Error('fixed needs a note describing the fix')
  }
  if (status === 'deferred'
    && (typeof options.note !== 'string' || options.note.trim() === '')) {
    throw new Error('deferred needs a note')
  }
  if (status === 'rejected' && (typeof options.note !== 'string' || options.note.trim() === '')) {
    throw new Error('rejected needs a note with the evidence')
  }
  if (status === 'waived'
    && (options.approvedBy !== 'user'
      || typeof options.waiver !== 'string'
      || options.waiver.trim() === '')) {
    throw new Error('waived needs approvedBy user and the waiver text')
  }
  if (['deferred', 'rejected'].includes(status)) {
    const passCriteria = options.passCriteria ?? 'major'
    const inThreshold = severityInThreshold(finding.severity, passCriteria)
    const allowed = ['fixed', 'waived']
    if (!inThreshold) {
      if (options.allowDeferred !== false) allowed.push('deferred')
      if (options.allowRejected !== false) allowed.push('rejected')
    }
    const allowedText = allowed.join(', ')
    if (inThreshold) {
      throw new Error(
        `finding ${finding.id} is ${finding.severity} at or above pass criteria ${passCriteria}; it cannot be ${status}; allowed: ${allowedText}`,
      )
    }
    if (status === 'deferred' && options.allowDeferred === false) {
      throw new Error(`finding ${finding.id} cannot be deferred: deferred dispositions are disabled for this review; allowed: ${allowedText}`)
    }
    if (status === 'rejected' && options.allowRejected === false) {
      throw new Error(`finding ${finding.id} cannot be rejected: rejected dispositions are disabled for this review; allowed: ${allowedText}`)
    }
  }
  const now = new Date().toISOString()
  finding.status = status
  finding.note = options.note ?? null
  finding.waiver = options.waiver ?? null
  finding.approvedBy = options.approvedBy ?? null
  finding.disposedAt = now
  finding.waivedAt = status === 'waived' ? now : null
  delete finding.verifiedInRound
  delete finding.verifiedInRoundToken
  delete finding.verifiedAt
  delete finding.lastVerification
  return finding
}

/**
 * Convert a report finding into a recorded finding.
 * @param finding - report finding.
 * @param roundToken - current round token.
 * @param seq - current round sequence.
 * @returns the recorded finding.
 */
export function recordFinding(finding, roundToken, seq) {
  return {
    id: finding.id,
    severity: finding.severity,
    axis: finding.axis,
    location: finding.location,
    title: finding.title,
    problem: finding.problem,
    evidence: finding.evidence,
    impact: finding.impact ?? null,
    rule: finding.rule ?? null,
    failure: finding.failure ?? null,
    suggestion: finding.suggestion,
    status: 'open',
    firstRound: seq,
    firstRoundToken: roundToken,
  }
}

/**
 * Summarize findings for a tool result.
 * @param findings - recorded findings.
 * @returns counts by status and blocking count.
 */
export function summarizeFindings(findings, passCriteria = 'major') {
  const counts = {
    total: findings.length,
    open: 0,
    fixed: 0,
    verified: 0,
    verifiedDeferred: 0,
    verifiedRejected: 0,
    deferred: 0,
    rejected: 0,
    waived: 0,
    blocking: 0,
  }
  for (const finding of findings) {
    if (finding.status === 'verified-deferred') counts.verifiedDeferred += 1
    else if (finding.status === 'verified-rejected') counts.verifiedRejected += 1
    else if (Object.hasOwn(counts, finding.status)) counts[finding.status] += 1
    if (severityInThreshold(finding.severity, passCriteria) && !RESOLVED_STATUSES.includes(finding.status)) counts.blocking += 1
  }
  return counts
}
