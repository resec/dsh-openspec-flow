import assert from 'node:assert/strict'
import test from 'node:test'
import {
  clearDeadline,
  clearReviewDeadlines,
  deadlineText,
  pendingDeadline,
  registerDeadline,
  sendWakeup,
  wakeTargets,
  wakeText,
} from '../lib/review/wakeup.js'

const DIRECTORY = '/tmp/openspec-flow-wakeup-unit'
const KIND = 'draft'

test.after(() => clearReviewDeadlines())

test('wakeText names the submitted round and its optional fields', () => {
  assert.equal(
    wakeText({
      change: 'c', kind: 'draft', round: 2, verdict: 'pass', ready: true, nextAction: 'openspec_apply_next',
    }),
    'draft review c round 2 submitted; verdict pass; ready; next: openspec_apply_next. Call openspec_review action="report" for the full report.',
  )
  assert.equal(
    wakeText({ change: 'c', kind: 'draft' }),
    'draft review c round ? submitted. Call openspec_review action="report" for the full report.',
  )
  assert.equal(
    wakeText({ change: 'c', kind: 'draft', round: 1, ready: false }),
    'draft review c round 1 submitted; not ready. Call openspec_review action="report" for the full report.',
  )
  assert.equal(
    wakeText({ change: 'c', kind: 'apply', round: 2, ready: true, nextAction: 'openspec_archive' }),
    'apply review c round 2 submitted; ready; next: openspec_archive. Call openspec_review action="report" review="apply" for the full report.',
  )
  assert.equal(
    wakeText({ change: 'c', kind: 'pr', round: 2, ready: true, nextAction: 'openspec_archive' }),
    'pr review c round 2 submitted; ready; next: openspec_archive. Call openspec_review action="report" review="pr" for the full report.',
  )
})

test('deadlineText names the wait limit and the recovery actions', () => {
  assert.match(deadlineText({ change: 'c', kind: 'apply', round: 3 }), /apply review c round 3 reached the wait limit/)
  assert.match(deadlineText({ change: 'c', kind: 'apply', round: 3 }), /action="extend" review="apply"/)
  assert.match(deadlineText({ change: 'c', kind: 'draft' }), /round \? reached the wait limit/)
  assert.match(deadlineText({ change: 'c', kind: 'pr', round: 2 }), /action="extend" review="pr"/)
  assert.match(deadlineText({ change: 'c', kind: 'pr', round: 2 }), /action="abandon" review="pr"/)
})

test('wakeTargets flattens, deduplicates and drops empty entries', () => {
  assert.deepEqual(wakeTargets(['a', 'b'], 'b', '', undefined, ['a', 'c']), ['a', 'b', 'c'])
  assert.deepEqual(wakeTargets(), [])
})

test('sendWakeup skips without a service, a sender or targets', async () => {
  const warnings = []
  const logger = {
    warn(message) {
      warnings.push(message)
    },
  }
  assert.deepEqual(await sendWakeup({ logger, get: () => undefined }, { id: 'r' }, ['a'], 'x'), [])
  assert.deepEqual(await sendWakeup({ logger, get: () => ({ sendMessage: async () => {} }) }, null, ['a'], 'x'), [])
  assert.deepEqual(await sendWakeup({ logger, get: () => ({ sendMessage: async () => {} }) }, undefined, ['a'], 'x'), [])
  assert.deepEqual(await sendWakeup({ logger, subagents: { sendMessage: async () => {} } }, { id: 'r' }, [], 'x'), [])
  assert.match(warnings.join(' '), /subagent service unavailable/)
  assert.match(warnings.join(' '), /no sender/)
})

test('sendWakeup isolates target failures and logs them', async () => {
  const calls = []
  const warnings = []
  const ctx = {
    logger: {
      warn(message) {
        warnings.push(message)
      },
    },
    get(name) {
      return name === 'subagents'
        ? {
            async sendMessage(sender, target) {
              calls.push(target)
              if (target === 'dead') throw new Error('dead target')
              if (target === 'plain') throw 'plain failure'
            },
          }
        : undefined
    },
  }
  const delivered = await sendWakeup(ctx, { id: 'reviewer' }, ['dead', 'live', 'plain'], 'text')
  assert.deepEqual(calls, ['dead', 'live', 'plain'])
  assert.deepEqual(delivered, ['live'])
  assert.match(warnings.join(' '), /wakeup to dead failed: dead target/)
  assert.match(warnings.join(' '), /wakeup to plain failed: plain failure/)
})

test('registerDeadline replaces, clears and exposes a pending entry', () => {
  clearReviewDeadlines()
  registerDeadline(DIRECTORY, KIND, {
    delayMs: 60_000,
    round: 1,
    deadline: Date.now() + 60_000,
    changerSessionId: 'a',
    reviewerAgentId: 'r',
    onFire: async () => {},
  })
  assert.equal(pendingDeadline(DIRECTORY, KIND).changerSessionId, 'a')
  const cleared = clearDeadline(DIRECTORY, KIND)
  assert.equal(cleared.changerSessionId, 'a')
  assert.equal(pendingDeadline(DIRECTORY, KIND), undefined)
  assert.equal(clearDeadline(DIRECTORY, KIND), undefined)
})

test('registerDeadline logs a failing onFire', async () => {
  const warnings = []
  registerDeadline(DIRECTORY, KIND, {
    delayMs: 10,
    round: 1,
    deadline: Date.now(),
    changerSessionId: 'a',
    reviewerAgentId: 'r',
    logger: {
      warn(message) {
        warnings.push(message)
      },
    },
    onFire: async () => {
      throw 'fire failed'
    },
  })
  await new Promise((resolve) => setTimeout(resolve, 80))
  assert.match(warnings.join(' '), /deadline wakeup failed: fire failed/)
})
