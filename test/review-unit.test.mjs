import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  assertReviewIgnored,
  assertSafeSegment,
  ensureReviewIgnored,
  gitCommit,
  gitCommitPaths,
  gitMergeBase,
  gitTree,
  isFile,
  isGitRepository,
  readJson,
  readText,
  reviewDirectory,
  reviewKey,
  sha256,
  withReviewLock,
  withReviewLockAsync,
  writeJsonAtomic,
} from '../lib/review/store.js'
import { normalizeReviews, draftSettings } from '../lib/review/config.js'
import { buildDraftBrief, renderReportContract } from '../lib/review/brief.js'
import { diffArtifactFiles, draftObject } from '../lib/review/object.js'
import {
  applyVerificationsTo,
  assertReport,
  disposeFinding,
  recordFinding,
  summarizeFindings,
} from '../lib/review/report.js'
import { draftReadiness } from '../lib/review/readiness.js'
import { submitReport } from '../lib/review/submit.js'
import { draftEnabled, ensureApplyPolicy, ensurePolicy, policyApply, policyDraft, readPolicy, removePolicy } from '../lib/review/policy.js'
import { relativeChangePath, storeSealSkipWarning } from '../lib/tools/review.js'

const CREATED = []

function temp() {
  const root = mkdtempSync(join(tmpdir(), 'openspec-flow-review-unit-'))
  CREATED.push(root)
  return root
}

function changeFixture() {
  const root = temp()
  const changeRoot = join(root, 'openspec', 'changes', 'demo')
  mkdirSync(join(changeRoot, 'specs', 'theme'), { recursive: true })
  writeFileSync(join(changeRoot, 'proposal.md'), '# Proposal\n')
  writeFileSync(join(changeRoot, 'design.md'), '# Design\n')
  writeFileSync(join(changeRoot, 'tasks.md'), '- [ ] 1.1 Do it\n')
  writeFileSync(join(changeRoot, '.openspec.yaml'), 'schema: spec-driven\n')
  writeFileSync(join(changeRoot, 'specs', 'theme', 'spec.md'), '# Theme\n')
  return { root, changeRoot }
}

function finding(extra = {}) {
  return {
    id: 'R1-01',
    severity: 'major',
    axis: 'coherence',
    location: 'proposal.md',
    title: 'A title',
    problem: 'A problem',
    evidence: 'Some evidence',
    impact: 'Some impact',
    rule: 'A rule',
    failure: 'A failure',
    suggestion: 'A suggestion',
    status: 'open',
    firstRound: 1,
    ...extra,
  }
}

test.after(() => {
  for (const root of CREATED) rmSync(root, { recursive: true, force: true })
})

test('review keys and directories are safe and store-aware', () => {
  assert.equal(reviewKey(undefined, 'demo'), 'local#demo')
  assert.equal(reviewKey('store-a', 'demo'), 'store-a#demo')
  assert.equal(reviewDirectory('/p', '', 'demo'), '/p/openspec/.review/local#demo')
  assert.throws(() => reviewKey('', '../demo'), /path segment/)
  assert.throws(() => reviewKey('a/b', 'demo'), /path segment/)
})

test('the review ignore entry is appended once', () => {
  const root = temp()
  mkdirSync(join(root, 'openspec'))
  writeFileSync(join(root, 'openspec', '.gitignore'), 'node_modules/\n')
  ensureReviewIgnored(root)
  ensureReviewIgnored(root)
  const text = readFileSync(join(root, 'openspec', '.gitignore'), 'utf8')
  assert.equal(text, 'node_modules/\n.review/\n')
  assert.doesNotThrow(() => assertReviewIgnored(root, join(root, 'openspec', '.review', 'x')))
})

test('the review ignore entry is not written when a repository rule already ignores it', () => {
  const root = temp()
  const run = (args) => {
    const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  run(['init'])
  writeFileSync(join(root, '.gitignore'), 'openspec/.review/\n')
  ensureReviewIgnored(root, join(root, 'openspec', '.review', 'local#demo'))
  assert.equal(existsSync(join(root, 'openspec', '.gitignore')), false)
  assert.doesNotThrow(() => assertReviewIgnored(root, join(root, 'openspec', '.review', 'local#demo')))
})

test('the lock is exclusive and released', () => {
  const root = temp()
  const directory = join(root, 'review')
  let entered = false
  assert.throws(
    () => withReviewLock(directory, 'test', () => {
      entered = true
      withReviewLock(directory, 'nested', () => {})
    }),
    /another write holds/,
  )
  assert.equal(entered, true)
  assert.doesNotThrow(() => withReviewLock(directory, 'again', () => {}))
})

test('review config normalizes defaults and limits', () => {
  assert.deepEqual(normalizeReviews(undefined).value, {
    draft: {
      enabled: true, reviewers: 0, waitMinutes: 15, reviewerModel: { source: 'inherit' },
    },
    apply: {
      enabled: true, reviewers: 0, waitMinutes: 15, reviewerModel: { source: 'inherit' },
    },
  })
  const invalid = normalizeReviews({ draft: { enabled: 'yes', reviewers: 2, maxRounds: 0, waitMinutes: 121 } })
  assert.equal(invalid.issues.length, 3)
  assert.deepEqual(draftSettings({ reviews: { draft: { enabled: false } } }), {
    enabled: false,
    reviewers: 0,
    waitMinutes: 15,
    reviewerModel: { source: 'inherit' },
  })
})

test('the draft object is stable and changes with an artifact', () => {
  const { changeRoot } = changeFixture()
  const first = draftObject(changeRoot, 'goal')
  const second = draftObject(changeRoot, 'goal')
  assert.deepEqual(first, second)
  writeFileSync(join(changeRoot, 'tasks.md'), '- [x] 1.1 Do it\n')
  const checkboxOnly = draftObject(changeRoot, 'goal')
  assert.equal(first.objectHash, checkboxOnly.objectHash)
  writeFileSync(join(changeRoot, 'tasks.md'), '- [ ] 1.2 Different task\n')
  const changed = draftObject(changeRoot, 'goal')
  assert.notEqual(first.objectHash, changed.objectHash)
})

test('the brief names the axes and the report contract', () => {
  const { root, changeRoot } = changeFixture()
  const object = draftObject(changeRoot, 'goal')
  const brief = buildDraftBrief({
    change: 'demo',
    objectHash: object.objectHash,
    intentHash: object.intentHash,
    files: object.files,
    projectRoot: root,
    round: 1,
  })
  assert.match(brief, /Draft review brief/)
  assert.match(brief, /"id": "R1-01"/)
  assert.match(brief, /"verifications": \[\]/)
  assert.match(brief, /`title`/)
  assert.match(brief, /review prompts, not report values/)
  assert.match(brief, /verified-fixed, still-open, regressed/)
  assert.match(brief, /required only for `critical` and `major`/)
  assert.equal(brief.split('A finding carries').length - 1, 1)
  assert.equal(brief.split('After you submit').length - 1, 1)
  assert.equal(brief.split('A `pass` verdict cannot').length - 1, 1)
  assert.match(brief, /Coherence/)
  assert.match(brief, /Intent fit/)
  assert.match(brief, /"verdict"/)
  assert.doesNotMatch(brief, /\bCLI\b/i)
})

test('the report contract follows the round and the recorded findings', () => {
  const { root, changeRoot } = changeFixture()
  const object = draftObject(changeRoot, 'goal')
  const base = {
    change: 'demo',
    objectHash: object.objectHash,
    intentHash: object.intentHash,
    files: object.files,
    projectRoot: root,
  }
  const second = buildDraftBrief({ ...base, round: 2, findings: [] })
  assert.match(second, /"id": "R2-01"/)
  assert.doesNotMatch(second, /R1-01/)
  const withFixed = buildDraftBrief({ ...base, round: 2, findings: [{ id: 'R1-01', status: 'fixed' }] })
  assert.match(withFixed, /"verifications": \[\{ "id": "R1-01"/)
  const noEligible = buildDraftBrief({ ...base, round: 2, findings: [{ id: 'R1-01', status: 'verified' }] })
  assert.match(noEligible, /"verifications": \[\]/)
  assert.doesNotMatch(noEligible, /"verifications": \[\{/)
  assert.throws(() => buildDraftBrief(base), /positive integer round/)
  assert.throws(() => buildDraftBrief({ ...base, round: 0 }), /positive integer round/)
  assert.throws(
    () => renderReportContract({ round: 1, locationHint: ' ' }),
    /location hint/,
  )
  assert.throws(() => renderReportContract({ round: 1 }), /location hint/)
})

test('report validation rejects malformed findings and contradictory verdicts', () => {
  const valid = { verdict: 'pass', summary: 'ok', findings: [] }
  assert.doesNotThrow(() => assertReport(valid, { round: 1, findings: [] }))
  assert.throws(() => assertReport({ ...valid, verdict: 'unknown' }, { round: 1, findings: [] }), /verdict/)
  assert.throws(() => assertReport({ ...valid, findings: [finding({ impact: '' })] }, { round: 1, findings: [] }), /impact/)
  assert.throws(
    () => assertReport({ ...valid, verdict: 'pass', findings: [finding()] }, { round: 1, findings: [] }),
    /pass verdict/,
  )
  assert.throws(
    () => assertReport({ ...valid, verdict: 'changes-requested' }, { round: 1, findings: [] }),
    /changes-requested/,
  )
})

test('finding dispositions follow the lifecycle', () => {
  const blocker = finding()
  assert.throws(() => disposeFinding(blocker, { status: 'deferred', note: 'later' }), /cannot be deferred/)
  assert.throws(() => disposeFinding(blocker, { status: 'waived', approvedBy: 'user' }), /waiver text/)
  disposeFinding(blocker, { status: 'waived', approvedBy: 'user', waiver: 'accepted' })
  assert.equal(blocker.status, 'waived')

  const minor = finding({ id: 'R1-02', severity: 'minor' })
  assert.throws(() => disposeFinding(minor, { status: 'deferred', issue: '#12' }), /needs a note/)
  disposeFinding(minor, { status: 'deferred', note: 'later' })
  assert.equal(minor.status, 'deferred')
  const fixed = finding({ id: 'R1-03', severity: 'minor' })
  assert.throws(() => disposeFinding(fixed, { status: 'fixed' }), /needs a note/)
  disposeFinding(fixed, { status: 'fixed', note: 'changed' })
  assert.equal(fixed.status, 'fixed')
})

test('readiness accounts for verdict, blockers and stale hashes', () => {
  const base = {
    state: 'in-review',
    objectHash: 'hash',
    rounds: [{ round: 1, verdict: 'pass', report: { path: 'report.json' } }],
    findings: [],
  }
  assert.deepEqual(draftReadiness(base, 'hash'), {
    ready: true,
    reasons: [],
    nextAction: 'openspec_apply_next',
  })
  const stale = draftReadiness(base, 'other')
  assert.equal(stale.ready, false)
  assert.match(stale.reasons.join(' '), /artifacts changed/)
  const blocked = draftReadiness({
    ...base,
    rounds: [{ round: 1, verdict: 'changes-requested', report: { path: 'report.json' } }],
    findings: [finding()],
  }, 'hash')
  assert.equal(blocked.ready, false)
  const staleOpen = draftReadiness({
    ...base,
    objectHash: 'old',
    findings: [finding({ status: 'open' })],
  }, 'new')
  assert.match(staleOpen.nextAction, /action=dispose/)
  const fixedOpen = draftReadiness({
    ...base,
    findings: [finding({ status: 'fixed' }), finding({ id: 'R1-02', severity: 'minor', status: 'open' })],
  }, 'hash')
  assert.match(fixedOpen.nextAction, /action=dispose/)
  const waived = draftReadiness({
    ...base,
    findings: [finding({ status: 'waived', approvedBy: 'user', waiver: 'ok' })],
  }, 'hash')
  assert.equal(waived.ready, true)
})

test('a blocking length result gates readiness and names resume', () => {
  const length = {
    limit: 500,
    blocking: true,
    issues: [{
      kind: 'modified-growth',
      spec: 'notes',
      path: 'specs/notes/spec.md',
      requirement: 'Stored notes',
      operation: 'MODIFIED',
      length: 656,
      baseline: 455,
    }],
    legacy: [],
  }
  const reported = {
    review: 'draft',
    state: 'in-review',
    objectHash: 'hash',
    mode: 'reviewer',
    rounds: [{ round: 1, verdict: 'pass', report: { path: 'report.json' } }],
    findings: [],
    length,
  }
  const blocked = draftReadiness(reported, 'hash', 'draft')
  assert.equal(blocked.ready, false)
  assert.match(blocked.reasons.join(' '), /requirement description gate/)
  assert.equal(blocked.nextAction, 'openspec_review action=resume review=draft')

  const unreported = draftReadiness({ ...reported, rounds: [] }, 'hash', 'draft')
  assert.equal(unreported.nextAction, 'openspec_review action=wait')
  const self = draftReadiness({ ...reported, rounds: [], mode: 'self' }, 'hash', 'draft')
  assert.equal(self.nextAction, 'openspec_review action=self-report')

  const open = draftReadiness({
    ...reported,
    findings: [finding({ status: 'open' })],
  }, 'hash', 'draft')
  assert.equal(open.nextAction, 'openspec_review action=dispose review=draft')

  const started = draftReadiness(reported, 'hash', 'draft', { applyStarted: true })
  assert.equal(started.ready, true)
  assert.doesNotMatch(started.reasons.join(' '), /requirement description gate/)
})

test('the draft brief renders the requirement length section', () => {
  const { root, changeRoot } = changeFixture()
  const object = draftObject(changeRoot, 'goal')
  const brief = buildDraftBrief({
    change: 'demo',
    objectHash: object.objectHash,
    intentHash: object.intentHash,
    files: object.files,
    projectRoot: root,
    round: 1,
    requirementLength: {
      limit: 500,
      blocking: true,
      issues: [{
        kind: 'modified-growth',
        spec: 'notes',
        path: 'specs/notes/spec.md',
        requirement: 'Stored notes',
        operation: 'MODIFIED',
        length: 656,
        baseline: 455,
      }],
      legacy: [],
    },
  })
  assert.match(brief, /## Requirement length/)
  assert.match(brief, /Stored notes/)
  assert.match(brief, /656/)
  assert.match(brief, /455/)
  assert.match(brief, /Do not compress/)
})

test('finding summaries count statuses and blockers', () => {
  const summary = summarizeFindings([
    finding({ status: 'open' }),
    finding({ id: 'R1-02', severity: 'minor', status: 'deferred' }),
    finding({ id: 'R1-03', severity: 'minor', status: 'verified', firstRound: 1, verifiedInRound: 2 }),
  ])
  assert.equal(summary.total, 3)
  assert.equal(summary.open, 1)
  assert.equal(summary.deferred, 1)
  assert.equal(summary.verified, 1)
  assert.equal(summary.blocking, 1)
})

test('recordFinding keeps the report fields and starts open', () => {
  const recorded = recordFinding(finding(), 1)
  assert.equal(recorded.status, 'open')
  assert.equal(recorded.firstRound, 1)
  assert.equal(recorded.rule, 'A rule')
})

test('policy helpers lock, read and remove one change', () => {
  const root = temp()
  mkdirSync(join(root, 'openspec'))
  const resolveModel = () => ({ provider: 'deepseek', model: 'deepseek-flash', reasoningEffort: 'max' })
  const locked = ensurePolicy({
    projectRoot: root,
    change: 'demo',
    store: undefined,
    settings: { reviews: { draft: { enabled: true, reviewers: 0, maxRounds: 4, waitMinutes: 20 } } },
    gitEnabled: false,
    lockedBy: 'new-change',
    resolveModel,
  })
  assert.equal(locked.created, true)
  assert.equal(locked.policy.reviews.draft.maxRounds, undefined)
  assert.deepEqual(locked.policy.reviews.draft.reviewerModel, {
    source: 'inherit', provider: 'deepseek', model: 'deepseek-flash', reasoningEffort: 'max',
  })
  assert.equal(draftEnabled(locked.policy), true)
  assert.deepEqual(policyDraft({}), {
    enabled: false, reviewers: 0, waitMinutes: 15, reviewerModel: { source: 'inherit' },
  })
  const again = ensurePolicy({
    projectRoot: root,
    change: 'demo',
    settings: { reviews: { draft: { enabled: false } } },
    gitEnabled: false,
    lockedBy: 'first-review',
    resolveModel,
  })
  assert.equal(again.created, false)
  assert.equal(again.policy.reviews.draft.enabled, true)
  removePolicy(locked.directory)
  assert.equal(readPolicy(locked.directory), undefined)
})

test('the draft object rejects a missing required artifact and empty specs', () => {
  const { changeRoot } = changeFixture()
  rmSync(join(changeRoot, 'tasks.md'))
  assert.throws(() => draftObject(changeRoot, 'goal'), /needs tasks\.md/)

  const second = changeFixture()
  rmSync(join(second.changeRoot, 'specs'), { recursive: true, force: true })
  assert.throws(() => draftObject(second.changeRoot, 'goal'), /at least one spec/)
})

test('the brief lists a related main spec when it exists', () => {
  const { root, changeRoot } = changeFixture()
  mkdirSync(join(root, 'openspec', 'specs', 'theme'), { recursive: true })
  writeFileSync(join(root, 'openspec', 'specs', 'theme', 'spec.md'), '# Main\n')
  const object = draftObject(changeRoot, 'goal')
  const brief = buildDraftBrief({
    change: 'demo',
    objectHash: object.objectHash,
    intentHash: object.intentHash,
    files: object.files,
    projectRoot: root,
    round: 1,
  })
  assert.match(brief, /Related main specs/)
  assert.match(brief, /openspec\/specs\/theme\/spec\.md/)
})

test('report validation covers unknown ids, duplicates and verdict conflicts', () => {
  const existing = [finding({ status: 'fixed' })]
  assert.throws(
    () => assertReport({ verdict: 'pass', summary: 'ok', findings: [], verifications: [{ id: 'R1-01', status: 'still-open', evidence: 'x' }] }, { round: 1, findings: [] }),
    /unknown finding/,
  )
  assert.throws(
    () => assertReport({
      verdict: 'pass', summary: 'ok', findings: [],
      verifications: [
        { id: 'R1-01', status: 'still-open', evidence: 'x' },
        { id: 'R1-01', status: 'still-open', evidence: 'y' },
      ],
    }, { round: 1, findings: existing }),
    /more than once/,
  )
  assert.doesNotThrow(
    () => assertReport({ verdict: 'pass', summary: 'ok', findings: [], outOfScope: ['1', '2', '3', '4', '5'] }, { round: 1, findings: [] }),
  )
  assert.throws(
    () => assertReport({ verdict: 'pass', summary: 'ok', findings: [], verifications: [{ id: 'R1-01', status: 'verified-fixed', evidence: 'x' }] }, { round: 1, findings: [finding({ status: 'open' })] }),
    /not fixed/,
  )
  for (const status of ['open', 'deferred', 'rejected']) {
    assert.throws(
      () => assertReport({ verdict: 'changes-requested', summary: 'ok', findings: [], verifications: [{ id: 'R1-01', status: 'verified-fixed', evidence: 'x' }] }, { round: 2, findings: [finding({ status })], kind: 'draft' }),
      new RegExp(`${status}.*action=dispose review=draft.*status=fixed`),
    )
  }
  assert.doesNotThrow(
    () => assertReport({ verdict: 'pass', summary: 'ok', findings: [], verifications: [] }, { round: 1, findings: [], kind: 'draft' }),
  )
  for (const status of ['verified', 'waived']) {
    try {
      assertReport({ verdict: 'pass', summary: 'ok', findings: [], verifications: [{ id: 'R1-01', status: 'verified-fixed', evidence: 'x' }] }, { round: 2, findings: [finding({ status })] })
      assert.fail(`expected the ${status} refusal`)
    } catch (error) {
      assert.match(error.message, new RegExp(`already ${status}.*closed`))
      assert.doesNotMatch(error.message, /action=dispose/)
    }
  }
})

test('verification transitions and dispositions cover every status', () => {
  const fixed = finding({ status: 'fixed' })
  const verified = applyVerificationsTo([fixed], [{ id: 'R1-01', status: 'verified-fixed', evidence: 'ok' }], 2)
  assert.equal(verified[0].status, 'verified')
  assert.equal(verified[0].verifiedInRound, 2)
  const regressed = applyVerificationsTo([fixed], [{ id: 'R1-01', status: 'regressed', evidence: 'bad' }], 2)
  assert.equal(regressed[0].status, 'open')
  assert.equal(regressed[0].lastVerification, 'regressed')

  const rejected = finding({ id: 'R1-02', severity: 'minor' })
  assert.throws(() => disposeFinding(rejected, { status: 'rejected' }), /needs a note/)
  disposeFinding(rejected, { status: 'rejected', note: 'not a defect' })
  assert.equal(rejected.status, 'rejected')
})

test('readiness reports abandoned, empty and deferred blockers', () => {
  const abandoned = draftReadiness({ state: 'abandoned', rounds: [], findings: [] }, 'hash')
  assert.equal(abandoned.ready, false)
  assert.match(abandoned.reasons.join(' '), /abandoned/)
  const empty = draftReadiness({ state: 'in-review', rounds: [], findings: [] }, 'hash')
  assert.equal(empty.ready, false)
  assert.match(empty.reasons.join(' '), /no review report/)
  const deferred = draftReadiness({
    state: 'in-review',
    objectHash: 'hash',
    rounds: [{ round: 1, verdict: 'pass', report: { path: 'report.json' } }],
    findings: [finding({ status: 'deferred', note: 'later' })],
  }, 'hash')
  assert.equal(deferred.ready, false)
  const fixed = draftReadiness({
    state: 'in-review',
    objectHash: 'hash',
    rounds: [{ round: 1, verdict: 'pass', report: { path: 'report.json' } }],
    findings: [finding({ status: 'fixed' })],
  }, 'hash')
  assert.equal(fixed.ready, false)
  assert.match(fixed.nextAction, /openspec_review action=resume review=draft/)

  const stale = draftReadiness({
    state: 'in-review',
    objectHash: 'old',
    rounds: [{ round: 1, verdict: 'pass', report: { path: 'report.json' } }],
    findings: [],
  }, 'new', 'apply')
  assert.equal(stale.ready, false)
  assert.match(stale.nextAction, /openspec_review action=resume review=apply/)

  const disposable = draftReadiness({
    state: 'in-review',
    objectHash: 'hash',
    rounds: [{ round: 1, verdict: 'changes-requested', report: { path: 'report.json' } }],
    findings: [finding({ status: 'open' })],
  }, 'hash')
  assert.equal(disposable.nextAction, 'openspec_review action=dispose review=draft')

  const oldIssue = draftReadiness({
    state: 'in-review',
    objectHash: 'hash',
    rounds: [{ round: 1, verdict: 'pass', report: { path: 'report.json' } }],
    findings: [finding({
      id: 'R1-04',
      severity: 'minor',
      status: 'verified',
      verifiedInRound: 2,
      firstRound: 1,
      issue: '#12',
    })],
  }, 'hash')
  assert.equal(oldIssue.ready, true)
})

test('store helpers read files, detect git and write JSON', () => {
  const root = temp()
  assert.equal(isGitRepository(root), false)
  assert.equal(gitCommit(root), undefined)
  assert.equal(isFile(join(root, 'none')), false)
  writeJsonAtomic(join(root, 'a.json'), { ok: true })
  assert.deepEqual(readJson(join(root, 'a.json')), { ok: true })
  writeFileSync(join(root, 'bad.json'), '{')
  assert.throws(() => readJson(join(root, 'bad.json')), /cannot parse/)
  assert.equal(readText(join(root, 'missing')), undefined)
})

test('report validation covers every malformed shape', () => {
  const base = { verdict: 'pass', summary: 'ok', findings: [] }
  assert.throws(() => assertReport(null, { round: 1, findings: [] }), /must be an object/)
  assert.throws(() => assertReport({ ...base, summary: '' }, { round: 1, findings: [] }), /summary/)
  assert.throws(() => assertReport({ ...base, findings: null }, { round: 1, findings: [] }), /findings must be an array/)
  assert.throws(() => assertReport({ ...base, findings: [null] }, { round: 1, findings: [] }), /not an object/)
  assert.throws(() => assertReport({ ...base, findings: [finding({ id: 'R2-01' })] }, { round: 1, findings: [] }), /must match/)
  assert.throws(() => assertReport({ ...base, findings: [finding({ severity: 'bad' })] }, { round: 1, findings: [] }), /unknown severity/)
  assert.throws(() => assertReport({ ...base, findings: [finding({ axis: 'bad' })] }, { round: 1, findings: [] }), /unknown axis/)
  assert.throws(() => assertReport({ ...base, findings: [finding({ location: '' })] }, { round: 1, findings: [] }), /location/)
  assert.throws(() => assertReport({ ...base, findings: [finding(), finding()] }, { round: 1, findings: [] }), /appears more than once/)
  assert.throws(() => assertReport({ ...base, verifications: null }, { round: 1, findings: [] }), /verifications must be an array/)
  assert.throws(() => assertReport({ ...base, verifications: [null] }, { round: 1, findings: [] }), /not an object/)
  assert.throws(() => assertReport({ ...base, verifications: [{ status: 'still-open', evidence: 'x' }] }, { round: 1, findings: [] }), /has no id/)
  assert.throws(() => assertReport({ ...base, verifications: [{ id: 'R1-01', status: 'bad', evidence: 'x' }] }, { round: 1, findings: [finding()] }), /unknown status/)
  assert.throws(() => assertReport({ ...base, verifications: [{ id: 'R1-01', status: 'still-open', evidence: '' }] }, { round: 1, findings: [finding()] }), /evidence/)
  assert.throws(
    () => assertReport({ ...base, findings: [], verifications: [] }, { round: 1, findings: [finding({ status: 'fixed' })] }),
    /needs a verification/,
  )
  assert.throws(() => assertReport({ ...base, outOfScope: null }, { round: 1, findings: [] }), /outOfScope must be an array/)
})

test('readiness rejects a verification in the same round and a bad waiver', () => {
  const base = {
    state: 'in-review',
    objectHash: 'hash',
    rounds: [{ round: 1, verdict: 'pass', report: { path: 'report.json' } }],
  }
  const sameRound = draftReadiness({
    ...base,
    findings: [finding({ status: 'verified', verifiedInRound: 1 })],
  }, 'hash')
  assert.equal(sameRound.ready, false)
  assert.match(sameRound.reasons.join(' '), /later verification round/)
  const badWaiver = draftReadiness({
    ...base,
    findings: [finding({ status: 'waived' })],
  }, 'hash')
  assert.equal(badWaiver.ready, false)
  assert.match(badWaiver.reasons.join(' '), /user waiver/)
  const unknown = draftReadiness({
    ...base,
    findings: [finding({ status: 'unknown' })],
  }, 'hash')
  assert.equal(unknown.ready, false)
})

test('store helpers cover path refusal, file checks and atomic failure', () => {
  assert.throws(() => reviewKey('', ''), /change/)
  assert.throws(() => reviewKey('', '.'), /change/)
  const root = temp()
  assert.equal(isFile(join(root, 'none')), false)
  writeFileSync(join(root, 'file'), 'x')
  assert.equal(isFile(join(root, 'file')), true)
  const directory = join(root, 'as-directory')
  mkdirSync(directory)
  assert.throws(() => writeTextAtomic(directory, 'x'))
})

test('git review paths are checked and a commit resolves', () => {
  const root = temp()
  const run = (args) => {
    const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  run(['init'])
  run(['config', 'user.email', 'test@example.com'])
  run(['config', 'user.name', 'Test'])
  writeFileSync(join(root, 'README.md'), '# Test\n')
  run(['add', 'README.md'])
  run(['commit', '-m', 'test'])
  assert.equal(isGitRepository(root), true)
  assert.match(gitCommit(root), /^[0-9a-f]{40}$/)
  ensureReviewIgnored(root)
  assert.doesNotThrow(() => assertReviewIgnored(root, join(root, 'openspec', '.review', 'local#demo')))
  assert.throws(
    () => assertReviewIgnored(root, join(root, 'outside')),
    /not ignored by git/,
  )
})

test('report text and entry counts are unbounded and deferred dispositions cover their branches', () => {
  assert.doesNotThrow(() => assertReport({
    verdict: 'pass',
    summary: 'x'.repeat(5_000),
    findings: [finding({
      severity: 'minor',
      location: 'l'.repeat(5_000),
      problem: 'p'.repeat(5_000),
      evidence: 'e'.repeat(5_000),
      suggestion: 's'.repeat(500),
      impact: 'i'.repeat(500),
      rule: 'r'.repeat(500),
      failure: 'f'.repeat(500),
    })],
    verifications: [],
    outOfScope: ['x'.repeat(500), '2', '3', '4', '5'],
    residualRisks: ['a', 'b', 'c', 'd'],
  }, { round: 1, findings: [] }))
  assert.throws(
    () => assertReport({ verdict: 'pass', summary: '  ', findings: [] }, { round: 1, findings: [] }),
    /non-empty/,
  )
  const minor = finding({ id: 'R1-02', severity: 'minor' })
  assert.throws(() => disposeFinding(minor, { status: 'deferred' }), /needs a note/)
})

test('recordFinding leaves optional blocking fields null for a minor finding', () => {
  const recorded = recordFinding(finding({ severity: 'minor', impact: undefined, rule: undefined, failure: undefined }), 1)
  assert.equal(recorded.impact, null)
  assert.equal(recorded.rule, null)
  assert.equal(recorded.failure, null)
})

test('readiness tolerates malformed rounds and findings', () => {
  const malformed = draftReadiness({
    state: 'in-review',
    objectHash: 'hash',
    rounds: 'bad',
    findings: 'bad',
  }, 'hash')
  assert.equal(malformed.ready, false)
  assert.match(malformed.reasons.join(' '), /no review report/)
})

test('apply policy helpers migrate and default', () => {
  const root = temp()
  mkdirSync(join(root, 'openspec'))
  const policy = {
    schemaVersion: 1,
    change: 'demo',
    reviews: { draft: { enabled: true, reviewers: 0, maxRounds: 3, waitMinutes: 15 } },
  }
  const directory = join(root, 'openspec', '.review', 'local#demo')
  mkdirSync(directory, { recursive: true })
  writeJsonAtomic(join(directory, 'policy.json'), policy)
  const migrated = ensureApplyPolicy(directory, policy, {
    reviews: { apply: { enabled: true, reviewers: 0, maxRounds: 6, waitMinutes: 20 } },
  })
  assert.equal(migrated.reviews.apply.maxRounds, undefined)
  assert.equal(readPolicy(directory).reviews.apply.maxRounds, undefined)
  assert.deepEqual(policyApply({}), {
    enabled: false, reviewers: 0, waitMinutes: 15, reviewerModel: { source: 'inherit' },
  })
})

test('git merge base resolves and fails cleanly', () => {
  const root = temp()
  const run = (args) => {
    const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout.trim()
  }
  run(['init'])
  run(['config', 'user.email', 'test@example.com'])
  run(['config', 'user.name', 'Test'])
  writeFileSync(join(root, 'a'), 'a')
  run(['add', 'a'])
  run(['commit', '-m', 'one'])
  const first = run(['rev-parse', 'HEAD'])
  writeFileSync(join(root, 'b'), 'b')
  run(['add', 'b'])
  run(['commit', '-m', 'two'])
  assert.equal(gitMergeBase(root, 'HEAD', first), first)
  assert.equal(gitMergeBase(root, 'HEAD', 'missing-ref'), undefined)
})

test('store rejects a non-string segment and a missing git tree', () => {
  assert.throws(() => assertSafeSegment(1, 'change'), /path segment/)
  const root = temp()
  assert.equal(gitTree(root, 'HEAD'), undefined)
})

test('the async review lock is exclusive and releases', async () => {
  const root = temp()
  const directory = join(root, 'review')
  await assert.doesNotReject(withReviewLockAsync(directory, 'test', async () => {}))
  await assert.rejects(
    withReviewLockAsync(directory, 'outer', async () => {
      await withReviewLockAsync(directory, 'inner', async () => {})
    }),
    /another write holds/,
  )
})

test('submitReport covers missing rounds, duplicate reports and empty findings', () => {
  const root = temp()
  const directory = join(root, 'review')
  mkdirSync(join(directory, 'round-1'), { recursive: true })
  const base = { rounds: [{ round: 1, objectHash: 'hash', startedAt: new Date().toISOString() }], findings: [] }
  assert.throws(
    () => submitReport({ directory, kind: 'draft', record: { rounds: [], findings: [] }, report: { verdict: 'pass', summary: 'ok', findings: [] }, currentHash: 'hash' }),
    /has no round/,
  )
  assert.throws(
    () => submitReport({
      directory,
      kind: 'draft',
      record: { ...base, rounds: [{ ...base.rounds[0], report: { path: 'x' } }] },
      report: { verdict: 'pass', summary: 'ok', findings: [] },
      currentHash: 'hash',
    }),
    /already has a report/,
  )
  const record = { objectHash: 'hash', rounds: [{ round: 1, objectHash: 'hash', startedAt: new Date().toISOString() }] }
  const result = submitReport({
    directory,
    kind: 'draft',
    record,
    report: { verdict: 'pass', summary: 'ok', findings: [] },
    currentHash: 'hash',
  })
  assert.equal(result.record.findings.length, 0)
  assert.equal(result.record.state, 'passed')
})

function git(root, args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return result.stdout.trim()
}

function gitRoot() {
  const root = temp()
  git(root, ['init', '-b', 'main'])
  git(root, ['config', 'user.email', 'test@example.com'])
  git(root, ['config', 'user.name', 'Test'])
  return root
}

test('gitCommitPaths lists a normal commit against its first parent', () => {
  const root = gitRoot()
  writeFileSync(join(root, 'a.txt'), 'a\n')
  writeFileSync(join(root, 'b.txt'), 'b\n')
  git(root, ['add', '.'])
  git(root, ['commit', '-m', 'first'])
  assert.deepEqual(gitCommitPaths(root, 'HEAD').sort(), ['a.txt', 'b.txt'])
  writeFileSync(join(root, 'b.txt'), 'b2\n')
  writeFileSync(join(root, 'c.txt'), 'c\n')
  git(root, ['add', '.'])
  git(root, ['commit', '-m', 'second'])
  assert.deepEqual(gitCommitPaths(root, 'HEAD').sort(), ['b.txt', 'c.txt'])
})

test('gitCommitPaths lists the initial commit against the empty tree', () => {
  const root = gitRoot()
  writeFileSync(join(root, 'only.txt'), 'only\n')
  git(root, ['add', '.'])
  git(root, ['commit', '-m', 'initial'])
  assert.deepEqual(gitCommitPaths(root, 'HEAD'), ['only.txt'])
})

test('gitCommitPaths compares a merge commit with its first parent', () => {
  const root = gitRoot()
  writeFileSync(join(root, 'base.txt'), 'base\n')
  git(root, ['add', '.'])
  git(root, ['commit', '-m', 'base'])
  git(root, ['checkout', '-b', 'feature'])
  writeFileSync(join(root, 'feature.txt'), 'feature\n')
  git(root, ['add', '.'])
  git(root, ['commit', '-m', 'feature'])
  git(root, ['checkout', 'main'])
  writeFileSync(join(root, 'main.txt'), 'main\n')
  git(root, ['add', '.'])
  git(root, ['commit', '-m', 'main'])
  git(root, ['merge', '--no-ff', 'feature', '-m', 'merge'])
  assert.deepEqual(gitCommitPaths(root, 'HEAD').sort(), ['feature.txt'])
})

test('gitCommitPaths returns undefined for an unknown revision', () => {
  const root = gitRoot()
  writeFileSync(join(root, 'a.txt'), 'a\n')
  git(root, ['add', '.'])
  git(root, ['commit', '-m', 'first'])
  assert.equal(gitCommitPaths(root, 'does-not-exist'), undefined)
})

test('relativeChangePath separates a project change from a store-backed one', () => {
  const root = join(tmpdir(), 'proj')
  assert.equal(relativeChangePath(root, join(root, 'openspec', 'changes', 'demo')), 'openspec/changes/demo')
  assert.equal(relativeChangePath(root, join(tmpdir(), 'store', 'changes', 'demo')), undefined)
  assert.equal(relativeChangePath(root, root), undefined)
})

test('the store seal skip warning names the change', () => {
  assert.match(storeSealSkipWarning('demo'), /store-backed change outside the project root: demo/)
})

test('diffArtifactFiles reports modified, added and removed files', () => {
  const changes = diffArtifactFiles(
    [{ path: 'design.md', sha256: 'a' }, { path: 'proposal.md', sha256: 'b' }, { path: 'tasks.md', sha256: 'c' }],
    [{ path: 'design.md', sha256: 'a2' }, { path: 'tasks.md', sha256: 'c' }, { path: 'specs/x/spec.md', sha256: 'd' }],
  )
  assert.deepEqual(changes, [
    { path: 'design.md', status: 'modified' },
    { path: 'proposal.md', status: 'removed' },
    { path: 'specs/x/spec.md', status: 'added' },
  ])
})

test('diffArtifactFiles treats a missing recorded list as all current files added', () => {
  assert.deepEqual(
    diffArtifactFiles(undefined, [{ path: 'design.md', sha256: 'a' }]),
    [{ path: 'design.md', status: 'added' }],
  )
})

test('diffArtifactFiles returns nothing when both lists are absent', () => {
  assert.deepEqual(diffArtifactFiles(undefined, undefined), [])
})
