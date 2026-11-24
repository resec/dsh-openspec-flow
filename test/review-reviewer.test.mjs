import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  mkdirSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { buildApplyBrief } from '../lib/review/brief.js'
import { apply as reviewerApply, PRESET_TOOL_NAMES } from '../reviewer.js'
import { clearCache } from '../lib/cache.js'
import { apply } from '../index.js'
import { createFakeContext } from './fake-context.mjs'
import { readApplyState } from '../lib/worktree/state.js'
import {
  CHANGE, DRAFT_OPENING, fixture, setup, call, reviewDir, report, majorFinding, minorFinding, gitFixture, passDraft, externalSetup, reviewerPresetDeclaration, reviewerPresetToolNames, cleanupFixtures,
} from './review-fixtures.mjs'

test.after(cleanupFixtures)

test('the reviewer activation carries the locked model and refuses an unavailable one', async () => {
  const root = fixture()
  const { fake, activations } = externalSetup(root)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  assert.deepEqual(activations[0].agentOptions, {
    provider: 'deepseek', model: 'deepseek-flash', reasoningEffort: 'max',
  })
  assert.equal(activations[0].agentPreset, 'openspec-reviewer')
  assert.equal(activations[0].parent.id, 'review-test')
  assert.equal(activations[0].request, undefined)

  // An explicit model the catalog does not know is refused before an activation exists.
  const missing = fixture()
  const missingSetup = externalSetup(missing, {
    draft: {
      enabled: true,
      reviewers: 1,
      reviewerModel: { source: 'explicit', provider: 'deepseek', model: 'missing-model' },
    },
  })
  await assert.rejects(
    call(missingSetup.fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' }),
    /model 'deepseek\/missing-model' is unavailable/,
  )
  assert.equal(missingSetup.activations.length, 0)

  // An unknown effort is refused the same way.
  const effort = fixture()
  const effortSetup = externalSetup(effort, {
    draft: {
      enabled: true,
      reviewers: 1,
      reviewerModel: { source: 'explicit', provider: 'deepseek', model: 'deepseek-flash', reasoningEffort: 'low' },
    },
  })
  await assert.rejects(
    call(effortSetup.fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' }),
    /reasoning effort 'low' is unavailable/,
  )
  assert.equal(effortSetup.activations.length, 0)
})

test('start fails closed when a locked policy needs a reviewer but the service is absent', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const policyPath = join(reviewDir(root), 'policy.json')
  const policy = JSON.parse(readFileSync(policyPath, 'utf8'))
  policy.reviews.draft.reviewers = 1
  writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`)
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'resume', change: CHANGE }),
    /reviewer service is unavailable/,
  )
})

test('an independent reviewer reads the brief, submits and unblocks apply', async () => {
  const root = fixture()
  const { fake, activations } = externalSetup(root)
  assert.equal(fake.tools.has('openspec_reviewer'), false)
  const started = await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  assert.equal(started.mode, 'reviewer')
  assert.equal(started.independent, true)
  assert.equal(activations.length, 1)
  assert.equal(activations[0].agentPreset, 'openspec-reviewer')

  const reviewer = createFakeContext({ cwd: root })
  reviewerApply(reviewer.ctx)
  const read = await reviewer.tools.get('openspec_reviewer').execute({
    action: 'read', target: 'brief', change: CHANGE, review: 'draft',
  }, { agent: { id: 'reviewer-1' }, signal: new AbortController().signal })
  assert.match(read.brief, /Draft review brief/)
  assert.equal(read.brief.split('\n')[2], DRAFT_OPENING)
  assert.doesNotMatch(read.brief, /you (wrote|drafted|planned)|as the changer/i)

  const submitted = await reviewer.tools.get('openspec_reviewer').execute({
    action: 'submit',
    change: CHANGE,
    review: 'draft',
    report: report(),
  }, { agent: { id: 'reviewer-1' }, signal: new AbortController().signal })
  assert.equal(submitted.ready, true)

  const waited = await call(fake, 'openspec_review', {
    action: 'wait', change: CHANGE, review: 'draft',
  })
  assert.equal(waited.ready, true)
  await call(fake, 'openspec_apply_next', { change: CHANGE })
})

test('an independent reviewer cross-change finding is refused for draft and apply', async () => {
  const root = fixture()
  const { fake } = externalSetup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const reviewer = createFakeContext({ cwd: root })
  reviewerApply(reviewer.ctx)
  const execute = (args) => reviewer.tools.get('openspec_reviewer').execute(args, {
    agent: { id: 'reviewer-1' }, signal: new AbortController().signal,
  })
  const cross = (location) => report({
    verdict: 'changes-requested',
    findings: [{ ...majorFinding(), location }],
  })
  await assert.rejects(
    execute({ action: 'submit', change: CHANGE, review: 'draft', report: cross('openspec/changes/other-change/tasks.md:12') }),
    /another change.*outOfScope/,
  )
  await assert.rejects(
    execute({ action: 'submit', change: CHANGE, review: 'draft', report: cross('apps/web/openspec/changes/other/tasks.md:12') }),
    /another change.*outOfScope/,
  )
  await assert.rejects(
    execute({ action: 'submit', change: CHANGE, review: 'draft', report: cross('openspec/changes/add-dark-mode/../other/tasks.md:12') }),
    /another change.*outOfScope/,
  )
  const accepted = await execute({
    action: 'submit',
    change: CHANGE,
    review: 'draft',
    report: report({ outOfScope: ['openspec/changes/other-change/tasks.md:12'] }),
  })
  assert.equal(accepted.ready, true)
})

test('a reviewer report from another agent is refused', async () => {
  const root = fixture()
  const { fake } = externalSetup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const reviewer = createFakeContext({ cwd: root })
  reviewerApply(reviewer.ctx)
  await assert.rejects(
    reviewer.tools.get('openspec_reviewer').execute({
      action: 'submit', change: CHANGE, review: 'draft', report: report(),
    }, { agent: { id: 'someone-else' }, signal: new AbortController().signal }),
    /not the reviewer/,
  )
})

test('retry, replace and waive-reviewer handle a missing reviewer report', async () => {
  const root = fixture()
  const { fake, activations, messages } = externalSetup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await call(fake, 'openspec_review', { action: 'retry', change: CHANGE, review: 'draft' })
  assert.equal(messages.length, 1)
  await call(fake, 'openspec_review', { action: 'retry', change: CHANGE, review: 'draft' })
  assert.equal(messages.length, 2)
  await call(fake, 'openspec_review', {
    action: 'replace', change: CHANGE, review: 'draft', reason: 'stuck',
  })
  assert.equal(activations.length, 2)
  const waived = await call(fake, 'openspec_review', {
    action: 'waive-reviewer',
    change: CHANGE,
    review: 'draft',
    waiver: 'accepted by the user',
    approvedBy: 'user',
  })
  assert.equal(waived.ready, true)
  assert.equal(waived.coverageGap, true)
})

test('retry and replace are not capped by a count', async () => {
  const root = fixture()
  const { fake, activations, messages } = externalSetup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  assert.equal(activations.length, 1)
  await call(fake, 'openspec_review', { action: 'retry', change: CHANGE, review: 'draft' })
  await call(fake, 'openspec_review', { action: 'retry', change: CHANGE, review: 'draft' })
  assert.equal(messages.length, 2)
  await call(fake, 'openspec_review', {
    action: 'replace', change: CHANGE, review: 'draft', reason: 'first replacement',
  })
  await call(fake, 'openspec_review', {
    action: 'replace', change: CHANGE, review: 'draft', reason: 'second replacement',
  })
  assert.equal(activations.length, 3)
  const record = JSON.parse(readFileSync(join(reviewDir(root), 'review.json'), 'utf8'))
  assert.equal(record.reviewers.slots[0].retries, 2)
  assert.equal(record.reviewers.slots[0].replacements.length, 2)
})

test('the reviewer reads its report and status and refuses a duplicate submit', async () => {
  const root = fixture()
  const { fake } = externalSetup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const reviewer = createFakeContext({ cwd: root })
  reviewerApply(reviewer.ctx)
  const execute = (args) => reviewer.tools.get('openspec_reviewer').execute(args, {
    agent: { id: 'reviewer-1' }, signal: new AbortController().signal,
  })
  const status = await execute({ action: 'status', change: CHANGE, review: 'draft' })
  assert.equal(status.state, 'in-review')
  await execute({ action: 'submit', change: CHANGE, review: 'draft', report: report() })
  const own = await execute({ action: 'read', target: 'own-report', change: CHANGE, review: 'draft' })
  assert.equal(own.report.verdict, 'pass')
  await assert.rejects(
    execute({ action: 'submit', change: CHANGE, review: 'draft', report: report() }),
    /already has a report/,
  )
  await assert.rejects(
    execute({ action: 'submit', change: CHANGE, review: 'draft', round: 2, report: report() }),
    /current draft round is 1/,
  )
})

test('the reviewer reads an earlier round and the finding state', async () => {
  const root = fixture()
  const { fake } = externalSetup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const reviewer = createFakeContext({ cwd: root })
  reviewerApply(reviewer.ctx)
  const execute = (args) => reviewer.tools.get('openspec_reviewer').execute(args, {
    agent: { id: 'reviewer-1' }, signal: new AbortController().signal,
  })
  await execute({
    action: 'submit', change: CHANGE, review: 'draft',
    report: report({ verdict: 'changes-requested', findings: [majorFinding()] }),
  })
  await call(fake, 'openspec_review', {
    action: 'dispose', review: 'draft', change: CHANGE, id: 'R1-01', status: 'fixed', note: 'Fixed.',
  })
  await call(fake, 'openspec_review', { action: 'resume', change: CHANGE, round: 2 })

  const before = readFileSync(join(reviewDir(root), 'review.json'), 'utf8')
  const first = await execute({ action: 'read', target: 'own-report', change: CHANGE, review: 'draft', round: 1 })
  assert.equal(first.round, 1)
  assert.equal(first.report.verdict, 'changes-requested')
  const findings = await execute({ action: 'read', target: 'findings', change: CHANGE, review: 'draft' })
  assert.equal(findings.findings[0].id, 'R1-01')
  assert.equal(findings.findings[0].status, 'fixed')
  assert.equal(findings.findings[0].firstRound, 1)
  assert.equal(findings.findings[0].verifiedInRound, null)
  assert.equal(findings.findings[0].lastVerification, null)
  assert.deepEqual(findings.rounds[0], { round: 1, verdict: 'changes-requested', hasReport: true })
  assert.deepEqual(findings.rounds[1], { round: 2, verdict: null, hasReport: false })
  await assert.rejects(
    execute({ action: 'read', target: 'own-report', change: CHANGE, review: 'draft', round: 9 }),
    /round 9 is not recorded/,
  )
  await assert.rejects(
    execute({ action: 'read', target: 'own-report', change: CHANGE, review: 'draft', round: 2 }),
    /round 2 has no report/,
  )
  assert.equal(readFileSync(join(reviewDir(root), 'review.json'), 'utf8'), before)
})

test('the findings read returns verification rounds and last verification', async () => {
  const root = fixture()
  const { fake } = externalSetup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const reviewer = createFakeContext({ cwd: root })
  reviewerApply(reviewer.ctx)
  const execute = (args) => reviewer.tools.get('openspec_reviewer').execute(args, {
    agent: { id: 'reviewer-1' }, signal: new AbortController().signal,
  })
  await execute({
    action: 'submit', change: CHANGE, review: 'draft',
    report: report({ verdict: 'changes-requested', findings: [majorFinding(), minorFinding()] }),
  })
  await call(fake, 'openspec_review', {
    action: 'dispose', review: 'draft', change: CHANGE, id: 'R1-01', status: 'fixed', note: 'Fixed.',
  })
  await call(fake, 'openspec_review', {
    action: 'dispose', review: 'draft', change: CHANGE, id: 'R1-02', status: 'fixed', note: 'Fixed.',
  })
  await call(fake, 'openspec_review', { action: 'resume', change: CHANGE, round: 2 })
  await execute({
    action: 'submit', change: CHANGE, review: 'draft', round: 2,
    report: report({
      verdict: 'pass',
      findings: [],
      verifications: [
        { id: 'R1-01', status: 'verified-fixed', evidence: 'Checked.' },
        { id: 'R1-02', status: 'still-open', evidence: 'Still open.' },
      ],
    }),
  })
  const projected = await execute({ action: 'read', target: 'findings', change: CHANGE, review: 'draft' })
  const verified = projected.findings.find((finding) => finding.id === 'R1-01')
  const reopened = projected.findings.find((finding) => finding.id === 'R1-02')
  assert.equal(verified.status, 'verified')
  assert.equal(verified.verifiedInRound, 2)
  assert.equal(verified.lastVerification, null)
  assert.equal(reopened.status, 'open')
  assert.equal(reopened.verifiedInRound, null)
  assert.equal(reopened.lastVerification, 'still-open')
})

test('the reviewer refuses a missing record, a missing slot and a changed object', async () => {
  const root = fixture()
  const reviewer = createFakeContext({ cwd: root })
  reviewerApply(reviewer.ctx)
  const execute = (args) => reviewer.tools.get('openspec_reviewer').execute(args, {
    agent: { id: 'reviewer-1' }, signal: new AbortController().signal,
  })
  await assert.rejects(execute({ action: 'status', change: CHANGE, review: 'draft' }), /no draft review/)

  const self = setup(root)
  await call(self, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await assert.rejects(execute({ action: 'status', change: CHANGE, review: 'draft' }), /no reviewer slot/)

  const externalRoot = fixture()
  const external = externalSetup(externalRoot)
  await call(external.fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const externalReviewer = createFakeContext({ cwd: externalRoot })
  reviewerApply(externalReviewer.ctx)
  writeFileSync(join(externalRoot, 'openspec', 'changes', CHANGE, 'tasks.md'), '\n## 1. New\n\n- [ ] 1.1 New task\n')
  await assert.rejects(
    externalReviewer.tools.get('openspec_reviewer').execute({
      action: 'submit', change: CHANGE, review: 'draft', report: report(),
    }, { agent: { id: 'reviewer-1' }, signal: new AbortController().signal }),
    /object changed/,
  )
})

test('replace and waive-reviewer validate their preconditions', async () => {
  const root = fixture()
  const { fake, activations } = externalSetup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'replace', change: CHANGE, review: 'draft' }),
    /needs a reason/,
  )
  await call(fake, 'openspec_review', {
    action: 'replace', change: CHANGE, review: 'draft', reason: 'stuck',
  })
  await call(fake, 'openspec_review', {
    action: 'replace', change: CHANGE, review: 'draft', reason: 'again',
  })
  assert.equal(activations.length, 3)
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'waive-reviewer', change: CHANGE, review: 'draft', waiver: 'ok',
    }),
    /approvedBy user/,
  )
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'waive-reviewer', change: CHANGE, review: 'draft', approvedBy: 'user',
    }),
    /waiver text/,
  )
})

test('an independent apply reviewer submits a tree report', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  const policyPath = join(reviewDir(root), 'policy.json')
  const policy = JSON.parse(readFileSync(policyPath, 'utf8'))
  policy.reviews.apply.reviewers = 1
  writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`)
  const external = externalSetup(root)
  await call(external.fake, 'openspec_review', {
    action: 'start', change: CHANGE, review: 'apply',
  })
  assert.equal(external.activations.length, 1)
  const reviewer = createFakeContext({ cwd: root })
  reviewerApply(reviewer.ctx)
  await assert.rejects(
    reviewer.tools.get('openspec_reviewer').execute({
      action: 'submit', change: CHANGE, review: 'apply',
      report: report({
        verdict: 'changes-requested',
        findings: [{ ...majorFinding(), location: 'openspec/changes/other-change/tasks.md:12' }],
      }),
    }, { agent: { id: 'reviewer-1' }, signal: new AbortController().signal }),
    /another change.*outOfScope/,
  )
  const submitted = await reviewer.tools.get('openspec_reviewer').execute({
    action: 'submit', change: CHANGE, review: 'apply', report: report(),
  }, { agent: { id: 'reviewer-1' }, signal: new AbortController().signal })
  assert.equal(submitted.ready, true)
  const waited = await call(external.fake, 'openspec_review', {
    action: 'wait', change: CHANGE, review: 'apply',
  })
  assert.equal(waited.ready, true)
})

test('the reviewer reads a status target and refuses an own report before submission', async () => {
  const root = fixture()
  const { fake } = externalSetup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const reviewer = createFakeContext({ cwd: root })
  reviewerApply(reviewer.ctx)
  const execute = (args) => reviewer.tools.get('openspec_reviewer').execute(args, {
    agent: { id: 'reviewer-1' }, signal: new AbortController().signal,
  })
  const statusTarget = await execute({ action: 'read', target: 'status', change: CHANGE, review: 'draft' })
  assert.equal(statusTarget.state, 'in-review')
  const defaultTarget = await execute({ action: 'read', change: CHANGE, review: 'draft' })
  assert.match(defaultTarget.brief, /Draft review brief/)
  await assert.rejects(
    execute({ action: 'read', target: 'own-report', change: CHANGE, review: 'draft' }),
    /no report/,
  )
})

test('the reviewer tool rejects an unknown review kind', async () => {
  const root = fixture()
  const reviewer = createFakeContext({ cwd: root })
  reviewerApply(reviewer.ctx)
  await assert.rejects(
    reviewer.tools.get('openspec_reviewer').execute({
      action: 'status', change: CHANGE, review: 'other',
    }, { agent: { id: 'reviewer-1' }, signal: new AbortController().signal }),
    /review must be draft or apply/,
  )
})

test('a provider without agent preset support refuses the reviewer', async () => {
  const root = fixture()
  const subagents = {
    getProvider() {
      return { capabilities: { agentPreset: false, agentOptions: true } }
    },
    async startActivation() {
      throw new Error('must not start')
    },
  }
  clearCache()
  const fake = createFakeContext({ cwd: root, subagents })
  apply(fake.ctx, {
    timeoutMs: 30_000,
    reviews: { draft: { enabled: true, reviewers: 1 } },
  })
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'start', change: CHANGE, intent: 'Add a theme selector.',
    }),
    /does not support/,
  )
})

test('the reviewer handles a missing brief, an empty round and a missing slot', async () => {
  const root = fixture()
  const { fake } = externalSetup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const reviewer = createFakeContext({ cwd: root })
  reviewerApply(reviewer.ctx)
  const execute = (args) => reviewer.tools.get('openspec_reviewer').execute(args, {
    agent: { id: 'reviewer-1' }, signal: new AbortController().signal,
  })
  rmSync(join(reviewDir(root), 'round-1', 'brief.md'))
  const missing = await execute({ action: 'read', target: 'brief', change: CHANGE, review: 'draft' })
  assert.equal(missing.brief, '')
  const noReview = await execute({ action: 'read', target: 'brief', change: CHANGE })
  assert.equal(noReview.brief, '')

  const manual = fixture()
  mkdirSync(reviewDir(manual), { recursive: true })
  writeFileSync(join(reviewDir(manual), 'review.json'), JSON.stringify({
    schemaVersion: 1, id: 'x', change: CHANGE, review: 'draft', state: 'in-review',
    mode: 'reviewer', independent: true, objectHash: 'hash', rounds: [],
    findings: [], reviewers: { count: 1, slots: [{ slot: 1, agentId: 'reviewer-1' }] },
  }))
  const manualReviewer = createFakeContext({ cwd: manual })
  reviewerApply(manualReviewer.ctx)
  await assert.rejects(
    manualReviewer.tools.get('openspec_reviewer').execute({
      action: 'submit', change: CHANGE, review: 'draft', report: report(),
    }, { agent: { id: 'reviewer-1' }, signal: new AbortController().signal }),
    /has no round/,
  )
})

test('the reviewer refuses a record without a reviewer slot', async () => {
  const root = fixture()
  mkdirSync(reviewDir(root), { recursive: true })
  writeFileSync(join(reviewDir(root), 'review.json'), JSON.stringify({
    schemaVersion: 1, id: 'x', change: CHANGE, review: 'draft', state: 'in-review',
    mode: 'self', independent: false, objectHash: 'hash', rounds: [], findings: [],
  }))
  const reviewer = createFakeContext({ cwd: root })
  reviewerApply(reviewer.ctx)
  await assert.rejects(
    reviewer.tools.get('openspec_reviewer').execute({
      action: 'status', change: CHANGE, review: 'draft',
    }, { agent: { id: 'reviewer-1' }, signal: new AbortController().signal }),
    /no reviewer slot/,
  )
})

test('the reviewer refuses an apply record without a tree and a draft without intent', async () => {
  const root = fixture()
  mkdirSync(reviewDir(root), { recursive: true })
  writeFileSync(join(reviewDir(root), 'apply-review.json'), JSON.stringify({
    schemaVersion: 1, id: 'x', change: CHANGE, review: 'apply', state: 'in-review',
    mode: 'reviewer', independent: true, objectHash: 'hash', commitSha: 'missing',
    rounds: [{ round: 1, objectHash: 'hash', startedAt: new Date().toISOString() }],
    findings: [], reviewers: { count: 1, slots: [{ slot: 1, agentId: 'reviewer-1' }] },
  }))
  const reviewer = createFakeContext({ cwd: root })
  reviewerApply(reviewer.ctx)
  await assert.rejects(
    reviewer.tools.get('openspec_reviewer').execute({
      action: 'submit', change: CHANGE, review: 'apply', report: report(),
    }, { agent: { id: 'reviewer-1' }, signal: new AbortController().signal }),
    /HEAD could not be resolved/,
  )

  writeFileSync(join(reviewDir(root), 'review.json'), JSON.stringify({
    schemaVersion: 1, id: 'y', change: CHANGE, review: 'draft', state: 'in-review',
    mode: 'reviewer', independent: true, objectHash: 'hash',
    rounds: [{ round: 1, objectHash: 'hash', startedAt: new Date().toISOString() }],
    findings: [], reviewers: { count: 1, slots: [{ slot: 1, agentId: 'reviewer-1' }] },
  }))
  await assert.rejects(
    reviewer.tools.get('openspec_reviewer').execute({
      action: 'submit', change: CHANGE, review: 'draft', report: report(),
    }, { agent: { id: 'reviewer-1' }, signal: new AbortController().signal }),
    /intent file is missing/,
  )
})

test('retry fails closed without a reviewer service', async () => {
  const root = fixture()
  clearCache()
  const fake = createFakeContext({ cwd: root })
  apply(fake.ctx, {
    timeoutMs: 30_000,
    reviews: { draft: { enabled: true, reviewers: 1 } },
  })
  await assert.rejects(
    call(fake, 'openspec_review', { action: 'retry', change: CHANGE, review: 'draft' }),
    /reviewer service is unavailable/,
  )
})

test('the reviewer resolves a draft record without a change root', async () => {
  const root = fixture()
  const { fake } = externalSetup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const file = join(reviewDir(root), 'review.json')
  const record = JSON.parse(readFileSync(file, 'utf8'))
  delete record.changeRoot
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`)
  const reviewer = createFakeContext({ cwd: root })
  reviewerApply(reviewer.ctx)
  const submitted = await reviewer.tools.get('openspec_reviewer').execute({
    action: 'submit', change: CHANGE, review: 'draft', report: report(),
  }, { agent: { id: 'reviewer-1' }, signal: new AbortController().signal })
  assert.equal(submitted.ready, true)
  assert.equal(submitted.round, 1)
})

test('the reviewer refuses to read a brief without a round', async () => {
  const root = fixture()
  mkdirSync(reviewDir(root), { recursive: true })
  writeFileSync(join(reviewDir(root), 'review.json'), JSON.stringify({
    schemaVersion: 1, id: 'x', change: CHANGE, review: 'draft', state: 'in-review',
    mode: 'reviewer', independent: true, objectHash: 'hash', rounds: [], findings: [],
    reviewers: { count: 1, slots: [{ slot: 1, agentId: 'reviewer-1' }] },
  }))
  const reviewer = createFakeContext({ cwd: root })
  reviewerApply(reviewer.ctx)
  await assert.rejects(
    reviewer.tools.get('openspec_reviewer').execute({
      action: 'read', target: 'brief', change: CHANGE, review: 'draft',
    }, { agent: { id: 'reviewer-1' }, signal: new AbortController().signal }),
    /has no brief/,
  )
})

test('a reviewer start without the changer agent fails closed', async () => {
  const root = fixture()
  const { fake } = externalSetup(root)
  await assert.rejects(
    fake.tools.get('openspec_review').execute({
      action: 'start', change: CHANGE, intent: 'Add a theme selector.',
    }, { agent: null, signal: new AbortController().signal }),
    /needs the changer agent/,
  )
})

test('a reviewer service without provider lookup still activates a reviewer', async () => {
  const root = fixture()
  const activations = []
  const subagents = {
    async startActivation(spec) {
      activations.push(spec)
      return { childId: 'reviewer-1' }
    },
  }
  clearCache()
  const fake = createFakeContext({ cwd: root, subagents })
  apply(fake.ctx, {
    timeoutMs: 30_000,
    reviews: { draft: { enabled: true, reviewers: 1 } },
  })
  const started = await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  assert.equal(started.mode, 'reviewer')
  assert.equal(activations.length, 1)
  assert.equal(activations[0].agentPreset, 'openspec-reviewer')
})

test('a reviewer activation without a child id fails closed', async () => {
  const root = fixture()
  const subagents = {
    getProvider() {
      return { capabilities: { agentPreset: true, agentOptions: true } }
    },
    async startActivation() {
      return {}
    },
  }
  clearCache()
  const fake = createFakeContext({ cwd: root, subagents })
  apply(fake.ctx, {
    timeoutMs: 30_000,
    reviews: { draft: { enabled: true, reviewers: 1 } },
  })
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'start', change: CHANGE, intent: 'Add a theme selector.',
    }),
    /returned no child id/,
  )
})

test('self-report refuses an independently reviewed change', async () => {
  const root = fixture()
  const { fake } = externalSetup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'self-report', change: CHANGE, report: report(),
    }),
    /independent reviewers use openspec_reviewer/,
  )
})

test('retry refuses a self review and a record without a reviewer slot', async () => {
  const root = fixture()
  const messages = []
  const subagents = {
    async sendMessage(sender, target, content) {
      messages.push({ sender, target, content })
    },
  }
  clearCache()
  const selfFake = createFakeContext({ cwd: root, subagents })
  apply(selfFake.ctx, {
    timeoutMs: 30_000,
    reviews: { draft: { enabled: true, reviewers: 0 } },
  })
  await call(selfFake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await assert.rejects(
    call(selfFake, 'openspec_review', { action: 'retry', change: CHANGE, review: 'draft' }),
    /only available for an independent reviewer/,
  )
  assert.equal(messages.length, 0)

  const manual = fixture()
  mkdirSync(reviewDir(manual), { recursive: true })
  writeFileSync(join(reviewDir(manual), 'review.json'), JSON.stringify({
    schemaVersion: 1, id: 'x', change: CHANGE, review: 'draft', state: 'in-review',
    mode: 'reviewer', independent: true, objectHash: 'hash', rounds: [], findings: [],
    reviewers: { count: 1, slots: [] },
  }))
  const manualFake = createFakeContext({ cwd: manual, subagents })
  apply(manualFake.ctx, {
    timeoutMs: 30_000,
    reviews: { draft: { enabled: true, reviewers: 1 } },
  })
  await assert.rejects(
    call(manualFake, 'openspec_review', { action: 'retry', change: CHANGE, review: 'draft' }),
    /no reviewer slot/,
  )
  assert.equal(messages.length, 0)
})

test('replace refuses a self review and a record without a reviewer slot', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'replace', change: CHANGE, review: 'draft', reason: 'stuck',
    }),
    /only available for an independent reviewer/,
  )

  const manual = fixture()
  mkdirSync(reviewDir(manual), { recursive: true })
  writeFileSync(join(reviewDir(manual), 'review.json'), JSON.stringify({
    schemaVersion: 1, id: 'x', change: CHANGE, review: 'draft', state: 'in-review',
    mode: 'reviewer', independent: true, objectHash: 'hash', rounds: [], findings: [],
    reviewers: { count: 1, slots: [] },
  }))
  const manualFake = setup(manual)
  await assert.rejects(
    call(manualFake, 'openspec_review', {
      action: 'replace', change: CHANGE, review: 'draft', reason: 'stuck',
    }),
    /no reviewer slot/,
  )
})

test('waive-reviewer refuses a self review and a submitted report', async () => {
  const root = fixture()
  const fake = setup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  await assert.rejects(
    call(fake, 'openspec_review', {
      action: 'waive-reviewer', change: CHANGE, review: 'draft',
      waiver: 'accepted', approvedBy: 'user',
    }),
    /only available for an independent reviewer/,
  )

  const submittedRoot = fixture()
  const external = externalSetup(submittedRoot)
  await call(external.fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const reviewer = createFakeContext({ cwd: submittedRoot })
  reviewerApply(reviewer.ctx)
  await reviewer.tools.get('openspec_reviewer').execute({
    action: 'submit', change: CHANGE, review: 'draft', report: report(),
  }, { agent: { id: 'reviewer-1' }, signal: new AbortController().signal })
  await assert.rejects(
    call(external.fake, 'openspec_review', {
      action: 'waive-reviewer', change: CHANGE, review: 'draft',
      waiver: 'accepted', approvedBy: 'user',
    }),
    /already submitted a report/,
  )
})

test('waive-reviewer records a reason and leaves an unready review in review', async () => {
  const root = fixture()
  const { fake } = externalSetup(root)
  await call(fake, 'openspec_review', {
    action: 'start', change: CHANGE, intent: 'Add a theme selector.',
  })
  const file = join(reviewDir(root), 'review.json')
  const record = JSON.parse(readFileSync(file, 'utf8'))
  record.findings = [{ ...majorFinding(), status: 'open', firstRound: 1 }]
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`)
  const waived = await call(fake, 'openspec_review', {
    action: 'waive-reviewer', change: CHANGE, review: 'draft',
    waiver: 'accepted', approvedBy: 'user', reason: 'reviewer unavailable',
  })
  assert.equal(waived.coverageGap, true)
  assert.equal(waived.ready, false)
  assert.equal(waived.state, 'in-review')
  const saved = JSON.parse(readFileSync(file, 'utf8'))
  assert.equal(saved.reviewerWaived.reason, 'reviewer unavailable')
  assert.equal(saved.state, 'in-review')
})

test('the reviewer preset is read-only and exported as a subpath', () => {
  const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  assert.match(patch, /id: preset-openspec-reviewer/)
  assert.match(patch, /id: openspec-reviewer/)
  assert.match(patch, /read: true/)
  assert.match(patch, /readImage: true/)
  assert.match(patch, /write: false/)
  assert.match(patch, /edit: false/)
  assert.match(
    patch,
    /- id: tool-fs-search\n\s+name: '@deepseek-ai\/dsh-tool-fs-search'\n\s+config:\n\s+sampleOverCapGlobResults: false/,
  )
  assert.doesNotMatch(patch, /dsh-tool-bash/)
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  assert.equal(manifest.exports['./reviewer'], './reviewer.js')
  assert.ok(manifest.files.includes('reviewer.js'))
})

test('the reviewer preset composes the web tools without a provider', () => {
  const patch = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
  const lines = patch.split('\n')
  const start = lines.findIndex((line) => line.trim() === '- id: preset-openspec-reviewer')
  assert.ok(start >= 0, 'the reviewer preset row exists')
  const sibling = lines.findIndex((line, index) => index > start && /^ {4}- id: /.test(line))
  const preset = lines.slice(start, sibling < 0 ? lines.length : sibling).join('\n')
  const fsSearch = preset.indexOf("name: '@deepseek-ai/dsh-tool-fs-search'")
  const toolWeb = preset.indexOf("name: '@deepseek-ai/dsh-tool-web'")
  const reviewer = preset.indexOf("name: 'dsh-openspec-flow/reviewer'")
  assert.ok(fsSearch >= 0 && toolWeb > fsSearch && reviewer > toolWeb, 'tool-web sits between fs search and reviewer')
  assert.match(
    preset,
    /- id: tool-web\n\s+name: '@deepseek-ai\/dsh-tool-web'\n\s+config:\n\s+search: true\n\s+fetch: true\n\s+searchTimeoutMs: 60000/,
  )
  assert.doesNotMatch(preset, /name: '@deepseek-ai\/dsh-web'/)
  assert.doesNotMatch(preset, /dsh-web-(?:search|fetch|deepseek-api)/)
  assert.doesNotMatch(preset, /(?:search|fetch)Provider:/)
  assert.doesNotMatch(patch, /name: '@deepseek-ai\/dsh-web'/)
  assert.doesNotMatch(patch, /dsh-web-(?:search|fetch|deepseek-api)/)
  assert.doesNotMatch(patch, /(?:search|fetch)Provider:/)
})

test('the reviewer entry denies global Host tools and keeps the preset tools', () => {
  const hostTools = ['read', 'read_image', 'openspec_review', 'openspec_apply_next', 'openspec_apply_worktree', 'issues_create', 'create_worktree']
  const reviewer = createFakeContext({ cwd: process.cwd(), globalTools: hostTools })
  reviewerApply(reviewer.ctx)
  assert.deepEqual(reviewer.restrictions, [{
    deny: ['openspec_review', 'openspec_apply_next', 'openspec_apply_worktree', 'issues_create', 'create_worktree'],
  }])
  assert.equal(reviewer.tools.has('openspec_reviewer'), true)

  const changer = createFakeContext({ cwd: process.cwd(), globalTools: hostTools })
  apply(changer.ctx, {
    timeoutMs: 30_000,
    reviews: { draft: { enabled: true }, apply: { enabled: true } },
  })
  assert.deepEqual(changer.restrictions, [])
})

test('the reviewer entry retries a Host tool after a failed refresh restriction', () => {
  const reviewer = createFakeContext({ cwd: process.cwd(), globalTools: ['openspec_review'] })
  reviewerApply(reviewer.ctx)
  assert.deepEqual(reviewer.restrictions, [{ deny: ['openspec_review'] }])

  const original = reviewer.ctx.tools.restrict
  reviewer.ctx.tools.restrict = () => {
    throw new Error('restrict failed')
  }
  reviewer.globalTools.push('issues_create')
  reviewer.emit('tools/change', {})
  assert.deepEqual(reviewer.restrictions, [{ deny: ['openspec_review'] }])
  assert.match(reviewer.warnings.at(-1), /reviewer host-tool restriction failed: restrict failed/)

  reviewer.ctx.tools.restrict = original
  reviewer.emit('tools/change', {})
  assert.deepEqual(reviewer.restrictions.at(-1), { deny: ['issues_create'] })
  assert.equal(reviewer.tools.has('openspec_reviewer'), true)
})

test('the reviewer entry fails closed when the initial restriction throws', () => {
  const reviewer = createFakeContext({ cwd: process.cwd(), globalTools: ['openspec_review'] })
  reviewer.ctx.tools.restrict = () => {
    throw new Error('restrict unavailable')
  }
  assert.throws(() => reviewerApply(reviewer.ctx), /restrict unavailable/)
  assert.match(reviewer.warnings.at(-1), /reviewer host-tool restriction failed: restrict unavailable/)
  assert.equal(reviewer.tools.has('openspec_reviewer'), false)
})

test('buildApplyBrief records the host validation and handles its absent branch', () => {
  const base = {
    change: CHANGE,
    round: 1,
    findings: [],
    commitSha: 'a'.repeat(40),
    treeSha: 'b'.repeat(40),
    baseCommit: 'd'.repeat(40),
    baseSource: 'seal',
    baseTreeSha: 'c'.repeat(40),
    diffPath: 'apply-round-1/diff.patch',
    changedPaths: [],
  }
  assert.match(buildApplyBrief({ ...base, validation: undefined }), /- validation: not recorded/)
  assert.match(
    buildApplyBrief({ ...base, validation: { strict: true, issues: [] } }),
    /- validation: host strict pass \(0 issues\)/,
  )
  assert.match(
    buildApplyBrief({ ...base, validation: { strict: false, issues: [{ level: 'WARNING' }] } }),
    /- validation: host non-strict pass \(1 issue\)/,
  )
  assert.match(
    buildApplyBrief({ ...base, validation: { strict: true, issues: [{ level: 'INFO' }] } }),
    /- validation: host strict pass \(0 issues\)/,
  )
  assert.match(buildApplyBrief({ ...base, validation: { strict: true, issues: [] } }), /- \(none\)/)
  const seal = buildApplyBrief({ ...base, validation: { strict: true, issues: [] } })
  assert.match(seal, /"id": "R1-01"/)
  assert.match(seal, /"verifications": \[\]/)
  assert.match(seal, /repository-relative path and line/)
  assert.match(seal, /`title`/)
  assert.match(seal, /review prompts, not report values/)
  assert.match(seal, /verified-fixed, still-open, regressed/)
  assert.match(seal, /required only for `critical` and `major`/)
  assert.equal(seal.split('A finding carries').length - 1, 1)
  assert.equal(seal.split('After you submit').length - 1, 1)
  assert.equal(seal.split('A `pass` verdict cannot').length - 1, 1)
  assert.match(seal, /^- base: d{40}$/m)
  assert.match(seal, /The base is the seal commit recorded by the first `openspec_apply_next`\./)
  assert.match(seal, /The diff starts at the base tree/)
  assert.match(seal, /whole committed tree/)
  assert.match(seal, /An empty diff means/)
  assert.match(seal, /Check every task and delta requirement/)
  assert.match(seal, /see `## Base and diff` for the scope/)
  assert.match(seal, /Review any plan change in the diff on the plan axes/)
  const explicit = buildApplyBrief({ ...base, baseSource: 'explicit', validation: { strict: true, issues: [] } })
  assert.match(explicit, /The base is the explicit base passed to this review\./)
  assert.doesNotMatch(explicit, /seal commit recorded/)
  const merge = buildApplyBrief({ ...base, baseSource: 'merge-base', validation: { strict: true, issues: [] } })
  assert.match(merge, /git merge-base HEAD refs\/remotes\/origin\/main/)
  assert.match(merge, /no seal commit was recorded/)
})

test('the apply brief verifies a recorded fixed finding', () => {
  const base = {
    change: CHANGE,
    commitSha: 'a'.repeat(40),
    treeSha: 'b'.repeat(40),
    baseCommit: 'd'.repeat(40),
    baseSource: 'seal',
    baseTreeSha: 'c'.repeat(40),
    diffPath: 'apply-round-2/diff.patch',
    changedPaths: [],
  }
  const brief = buildApplyBrief({
    ...base,
    round: 2,
    findings: [{ id: 'R1-01', status: 'fixed' }],
    validation: { strict: true, issues: [] },
  })
  assert.match(brief, /"id": "R2-01"/)
  assert.match(brief, /"verifications": \[\{ "id": "R1-01"/)
  assert.match(
    buildApplyBrief({ ...base, round: 1, validation: { strict: true, issues: [] } }),
    /"verifications": \[\]/,
  )
  assert.throws(() => buildApplyBrief(base), /positive integer round/)
  assert.throws(() => buildApplyBrief({ ...base, round: 0 }), /positive integer round/)
})

test('the reviewer preset tool names match the declaration', () => {
  const plugins = reviewerPresetDeclaration()
  assert.deepEqual(plugins.map((plugin) => plugin.id), ['persona', 'tool-fs', 'tool-fs-search', 'tool-web', 'reviewer'])
  assert.deepEqual([...reviewerPresetToolNames(plugins)].sort(), [...PRESET_TOOL_NAMES].sort())
})

test('a passing apply submit wakes the changer toward archive', async () => {
  const { root, run } = gitFixture()
  const { fake, messages, subagents } = externalSetup(root, {
    draft: { enabled: true, reviewers: 0 },
    apply: { enabled: true, reviewers: 1 },
  })
  await passDraft(fake, root, run)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  const waited = await call(fake, 'openspec_review', {
    action: 'wait', change: CHANGE, review: 'apply',
  })
  assert.equal(waited.waitState, 'waiting')

  const reviewer = createFakeContext({ cwd: readApplyState(root, null, CHANGE).worktree, subagents })
  reviewerApply(reviewer.ctx)
  await reviewer.tools.get('openspec_reviewer').execute({
    action: 'submit', change: CHANGE, review: 'apply', report: report(),
  }, { agent: { id: 'reviewer-1' }, signal: new AbortController().signal })

  const last = messages.at(-1)
  assert.ok(last, 'the submit wakes the recorded changer session')
  const text = last.content.map((part) => part.text ?? '').join('')
  assert.match(text, /next: openspec_archive/)
})

test('an independent reviewer reads and submits an extra round', async () => {
  const { root, run } = gitFixture()
  const fake = setup(root)
  await passDraft(fake, root, run)
  const policyPath = join(reviewDir(root), 'policy.json')
  const policy = JSON.parse(readFileSync(policyPath, 'utf8'))
  policy.reviews.apply.reviewers = 1
  writeFileSync(policyPath, `${JSON.stringify(policy, null, 2)}\n`)
  const external = externalSetup(root)
  await call(external.fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  const file = join(reviewDir(root), 'apply-review.json')
  const record = JSON.parse(readFileSync(file, 'utf8'))
  record.rebaseReview = {
    requiredAt: new Date().toISOString(),
    mainHead: record.baseCommit,
    worktreeHead: record.commitSha,
    treeSha: 'b'.repeat(40),
  }
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`)
  const opened = await call(external.fake, 'openspec_review', { action: 'resume', change: CHANGE, review: 'apply' })
  assert.equal(opened.roundToken, 'E1')
  assert.match(JSON.stringify(external.messages.at(-1)), /E1/)
  const reviewer = createFakeContext({ cwd: root })
  reviewerApply(reviewer.ctx)
  const brief = await reviewer.tools.get('openspec_reviewer').execute({
    action: 'read', target: 'brief', change: CHANGE, review: 'apply',
  }, { agent: { id: 'reviewer-1' }, signal: new AbortController().signal })
  assert.equal(brief.roundToken, 'E1')
  assert.match(brief.brief, /E1-01/)
  const submitted = await reviewer.tools.get('openspec_reviewer').execute({
    action: 'submit', change: CHANGE, review: 'apply', report: report(),
  }, { agent: { id: 'reviewer-1' }, signal: new AbortController().signal })
  assert.equal(submitted.roundToken, 'E1')
  assert.equal(submitted.ready, true)
  const findings = await reviewer.tools.get('openspec_reviewer').execute({
    action: 'read', target: 'findings', change: CHANGE, review: 'apply',
  }, { agent: { id: 'reviewer-1' }, signal: new AbortController().signal })
  assert.ok(findings.rounds.some((entry) => entry.roundToken === 'E1'))
  const own = await reviewer.tools.get('openspec_reviewer').execute({
    action: 'read', target: 'own-report', round: 'E1', change: CHANGE, review: 'apply',
  }, { agent: { id: 'reviewer-1' }, signal: new AbortController().signal })
  assert.equal(own.roundToken, 'E1')
  assert.equal(own.report.verdict, 'pass')
})

test('the reviewer tool declares extra round fields', () => {
  const root = fixture()
  const fake = createFakeContext({ cwd: root })
  reviewerApply(fake.ctx)
  const tool = fake.tools.get('openspec_reviewer')
  const round = tool.parameters.properties.round
  assert.ok(Array.isArray(round.anyOf), 'the reviewer accepts a number or a token')
  assert.ok('roundToken' in tool.output.schema.properties)
  assert.ok('roundToken' in tool.output.schema.properties.rounds.items.properties)
})

function editStaleTasks(root) {
  writeFileSync(join(root, 'openspec', 'changes', CHANGE, 'tasks.md'), '\n## 1. Edited\n\n- [ ] 1.1 Edited task\n')
}

function reviewerRunner(root, subagents) {
  const reviewer = createFakeContext({ cwd: root, subagents })
  reviewerApply(reviewer.ctx)
  return (args) => reviewer.tools.get('openspec_reviewer').execute(args, {
    agent: { id: 'reviewer-1' }, signal: new AbortController().signal,
  })
}

test('a stale draft blocked submit is accepted and wakes the changer', async () => {
  const root = fixture()
  const { fake, messages, subagents } = externalSetup(root)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  editStaleTasks(root)
  const execute = reviewerRunner(root, subagents)
  const before = messages.length
  const result = await execute({
    action: 'submit', change: CHANGE, review: 'draft', round: 1,
    report: report({ verdict: 'blocked', summary: 'The artifacts changed during the round.', findings: [], verifications: [] }),
  })
  assert.equal(result.state, 'in-review')
  assert.equal(messages.length, before + 1)
  const record = JSON.parse(readFileSync(join(reviewDir(root), 'review.json'), 'utf8'))
  const round = record.rounds[0]
  assert.equal(round.verdict, 'blocked')
  assert.equal(round.report.verdict, 'blocked')
  assert.equal(round.blockedReason, 'stale-object')
  assert.notEqual(round.staleFrom, round.staleTo)
  assert.deepEqual(record.findings, [])
})

test('a stale draft pass submit is refused and names blocked', async () => {
  const root = fixture()
  const { fake } = externalSetup(root)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  editStaleTasks(root)
  const execute = reviewerRunner(root)
  await assert.rejects(
    execute({ action: 'submit', change: CHANGE, review: 'draft', round: 1, report: report() }),
    /blocked/,
  )
  const record = JSON.parse(readFileSync(join(reviewDir(root), 'review.json'), 'utf8'))
  assert.equal(record.rounds[0].report, undefined)
})

test('a stale draft blocked submit with findings is refused', async () => {
  const root = fixture()
  const { fake } = externalSetup(root)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  editStaleTasks(root)
  const execute = reviewerRunner(root)
  await assert.rejects(
    execute({
      action: 'submit', change: CHANGE, review: 'draft', round: 1,
      report: report({ verdict: 'blocked', findings: [majorFinding()], verifications: [] }),
    }),
    /no findings/,
  )
  const record = JSON.parse(readFileSync(join(reviewDir(root), 'review.json'), 'utf8'))
  assert.equal(record.rounds[0].report, undefined)
})

test('a fixed finding does not refuse a stale draft blocked submit', async () => {
  const root = fixture()
  const { fake } = externalSetup(root)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  const execute = reviewerRunner(root)
  await execute({
    action: 'submit', change: CHANGE, review: 'draft', round: 1,
    report: report({ verdict: 'changes-requested', findings: [majorFinding()] }),
  })
  await call(fake, 'openspec_review', {
    action: 'dispose', review: 'draft', change: CHANGE, id: 'R1-01', status: 'fixed', note: 'Added the task.',
  })
  await call(fake, 'openspec_review', { action: 'resume', change: CHANGE })
  editStaleTasks(root)
  const accepted = await execute({
    action: 'submit', change: CHANGE, review: 'draft', round: 2,
    report: report({ verdict: 'blocked', summary: 'The artifacts changed during the round.' }),
  })
  assert.equal(accepted.state, 'in-review')
  const record = JSON.parse(readFileSync(join(reviewDir(root), 'review.json'), 'utf8'))
  assert.equal(record.rounds[1].verdict, 'blocked')
  assert.equal(record.findings[0].status, 'fixed')
})

test('a late stale submission names its round and is refused', async () => {
  const root = fixture()
  const { fake } = externalSetup(root)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  editStaleTasks(root)
  await call(fake, 'openspec_review', { action: 'resume', change: CHANGE })
  const execute = reviewerRunner(root)
  await assert.rejects(
    execute({
      action: 'submit', change: CHANGE, review: 'draft', round: 1,
      report: report({ verdict: 'blocked', summary: 'The artifacts changed during the round.' }),
    }),
    /current draft round is 2, not 1/,
  )
})

test('an apply submit on a moved tree keeps the stale refusal', async () => {
  const { root, run } = gitFixture()
  const { fake } = externalSetup(root, {
    draft: { enabled: true, reviewers: 0 },
    apply: { enabled: true, reviewers: 1 },
  })
  await passDraft(fake, root, run)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, review: 'apply' })
  const state = readApplyState(root, null, CHANGE)
  writeFileSync(join(state.worktree, 'moved.txt'), 'x\n')
  const added = spawnSync('git', ['-C', state.worktree, 'add', 'moved.txt'], { encoding: 'utf8' })
  assert.equal(added.status, 0, added.stderr)
  const commit = spawnSync('git', ['-C', state.worktree, 'commit', '-m', 'move the tree'], { encoding: 'utf8' })
  assert.equal(commit.status, 0, commit.stderr)
  const reviewer = createFakeContext({ cwd: state.worktree })
  reviewerApply(reviewer.ctx)
  await assert.rejects(
    reviewer.tools.get('openspec_reviewer').execute({
      action: 'submit', change: CHANGE, review: 'apply', report: report(),
    }, { agent: { id: 'reviewer-1' }, signal: new AbortController().signal }),
    /apply object changed since this round started/,
  )
})

test('an un-tokened draft submit after a stale notice is refused', async () => {
  const root = fixture()
  const { fake } = externalSetup(root)
  await call(fake, 'openspec_review', { action: 'start', change: CHANGE, intent: 'Add a theme selector.' })
  const file = join(reviewDir(root), 'review.json')
  const record = JSON.parse(readFileSync(file, 'utf8'))
  record.staleNotice = { round: 1, from: 'a', to: 'b', at: new Date().toISOString() }
  writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`)
  const execute = reviewerRunner(root)
  await assert.rejects(
    execute({ action: 'submit', change: CHANGE, review: 'draft', report: report() }),
    /recorded a stale notice/,
  )
  const accepted = await execute({
    action: 'submit', change: CHANGE, review: 'draft', round: 1, report: report(),
  })
  assert.equal(accepted.state, 'passed')
})
