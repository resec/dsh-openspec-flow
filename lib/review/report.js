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

/** Finding severities, in report order. */
export const SEVERITIES = ['critical', 'major', 'minor', 'nit']

/** Review axes accepted from a report. */
export const AXES = ['intent', 'coherence', 'spec-conflict', 'standards', 'feasibility', 'quality']

/** Verdicts a report may carry. */
export const VERDICTS = ['pass', 'changes-requested', 'blocked']

/** Verification statuses. */
export const VERIFICATION_STATUSES = ['verified-fixed', 'still-open', 'regressed']

/** Severities that block readiness. */
export const BLOCKING = ['critical', 'major']

/**
 * Whether a severity blocks readiness.
 * @param severity - finding severity.
 * @returns true for critical or major.
 */
export function isBlocking(severity) {
  return BLOCKING.includes(severity)
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
 * Validate one reported finding.
 * @param finding - candidate.
 * @param round - current round.
 * @param index - position for diagnostics.
 * @returns nothing.
 */
function assertFinding(finding, round, index) {
  if (finding === null || typeof finding !== 'object' || Array.isArray(finding)) {
    throw new Error(`findings[${String(index)}] is not an object`)
  }
  const id = String(finding.id ?? '')
  if (!new RegExp(`^R${String(round)}-\\d{2}$`, 'u').test(id)) {
    throw new Error(`finding id '${id}' must match R${String(round)}-NN`)
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
 * @returns nothing.
 */
function assertVerifications(verifications, findings) {
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
    if (verification.status === 'verified-fixed' && finding.status !== 'fixed') {
      throw new Error(`finding ${id} is not fixed and cannot be verified-fixed`)
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
 * @param options - current round and findings before this report.
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
    assertFinding(finding, options.round, index)
    if (ids.has(finding.id)) throw new Error(`finding ${finding.id} appears more than once`)
    ids.add(finding.id)
  }
  for (const field of ['outOfScope', 'residualRisks']) {
    const value = report[field]
    if (value === undefined) continue
    if (!Array.isArray(value)) throw new Error(`report.${field} must be an array`)
    for (const entry of value) text(entry, `report.${field} entry`)
  }
  assertVerifications(report.verifications, options.findings)

  const after = applyVerificationsTo(
    options.findings.map((finding) => ({ ...finding })),
    report.verifications ?? [],
    options.round,
  )
  const all = [...after, ...report.findings.map((finding) => ({ ...finding, status: 'open' }))]
  const blockers = all.filter((finding) => isBlocking(finding.severity)
    && !['verified', 'waived'].includes(finding.status))
  if (report.verdict === 'pass' && blockers.length > 0) {
    throw new Error(`a pass verdict has open blocking findings: ${blockers.map((finding) => finding.id).join(', ')}`)
  }
  if (report.verdict === 'changes-requested' && blockers.length === 0) {
    throw new Error('a changes-requested verdict needs an open critical or major finding')
  }
}

/**
 * Apply one verification to a finding.
 * @param finding - finding to update.
 * @param verification - verification entry.
 * @param round - current round.
 * @param now - timestamp.
 * @returns the updated finding.
 */
function applyVerification(finding, verification, round, now) {
  if (verification.status === 'verified-fixed') {
    finding.status = 'verified'
    finding.verifiedInRound = round
    finding.verifiedAt = now
    delete finding.lastVerification
  } else {
    finding.status = 'open'
    finding.lastVerification = verification.status
    delete finding.verifiedInRound
    delete finding.verifiedAt
  }
  return finding
}

/**
 * Apply verifications to a copy of findings.
 * @param findings - findings before the report.
 * @param verifications - verified entries.
 * @param round - current round.
 * @param now - timestamp.
 * @returns updated findings.
 */
export function applyVerificationsTo(findings, verifications, round, now = new Date().toISOString()) {
  for (const verification of verifications) {
    const finding = findings.find((candidate) => candidate.id === verification.id)
    if (finding !== undefined) applyVerification(finding, verification, round, now)
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
    && (typeof options.note !== 'string' || options.note.trim() === '')
    && (typeof options.issue !== 'string' || options.issue.trim() === '')) {
    throw new Error('deferred needs a note or an issue')
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
  if (isBlocking(finding.severity) && ['deferred', 'rejected'].includes(status)) {
    throw new Error(`finding ${finding.id} is ${finding.severity}; it cannot be ${status}`)
  }
  const now = new Date().toISOString()
  finding.status = status
  finding.note = options.note ?? null
  finding.issue = options.issue ?? null
  finding.waiver = options.waiver ?? null
  finding.approvedBy = options.approvedBy ?? null
  finding.disposedAt = now
  finding.waivedAt = status === 'waived' ? now : null
  delete finding.verifiedInRound
  delete finding.verifiedAt
  delete finding.lastVerification
  return finding
}

/**
 * Convert a report finding into a recorded finding.
 * @param finding - report finding.
 * @param round - current round.
 * @returns the recorded finding.
 */
export function recordFinding(finding, round) {
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
    firstRound: round,
  }
}

/**
 * Summarize findings for a tool result.
 * @param findings - recorded findings.
 * @returns counts by status and blocking count.
 */
export function summarizeFindings(findings) {
  const counts = { total: findings.length, open: 0, fixed: 0, verified: 0, deferred: 0, rejected: 0, waived: 0, blocking: 0 }
  for (const finding of findings) {
    if (Object.hasOwn(counts, finding.status)) counts[finding.status] += 1
    if (isBlocking(finding.severity) && !['verified', 'waived'].includes(finding.status)) counts.blocking += 1
  }
  return counts
}
