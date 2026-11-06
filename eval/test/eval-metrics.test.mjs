import assert from 'node:assert/strict'
import test from 'node:test'
import { aggregateRuns, buildRunMetrics, iqr, median, quantile } from '../lib/metrics.mjs'

function usage(input, output, cacheRead = 0) {
  return {
    inputTokens: input,
    outputTokens: output,
    cacheReadTokens: cacheRead,
    cacheWriteTokens: 0,
    totalTokens: input + output + cacheRead,
  }
}

function summary() {
  return {
    sessionId: 'session-test',
    model: { provider: 'deepseek-account', model: 'deepseek-flash' },
    usage: usage(300, 30, 900),
    prompt: { firstRequestTokens: 1000, peakRequestTokens: 1100, totalRequestTokens: 2100 },
    perTurn: [
      {
        turn: 1,
        usage: usage(200, 20, 500),
        steps: 1,
        stepDetails: [{ step: 1, usage: usage(200, 20, 500), hasToolCall: true }],
      },
      {
        turn: 2,
        usage: usage(100, 10, 400),
        steps: 2,
        stepDetails: [
          { step: 1, usage: usage(50, 5, 50), hasToolCall: false },
          { step: 2, usage: usage(50, 5, 350), hasToolCall: true },
        ],
      },
    ],
    steps: 3,
    turns: 2,
    tools: {
      calls: 4,
      byTool: { bash: 2, openspec_list: 2 },
      openspecCliCalls: 1,
      actions: ['openspec_list'],
      skillLoads: ['openspec-flow'],
      resultBytes: 400,
      resultBytesByTool: { bash: 300, openspec_list: 100 },
      resultErrors: 1,
      askUserQuestions: 2,
    },
    skills: { catalog: ['openspec-flow'], loaded: ['openspec-flow'] },
    retries: 1,
    compactions: 0,
    durationMs: 1234,
    missingUsage: [],
    toolSurface: { count: 37, openspecTools: ['openspec_list'], hasWeb: true, hasSubagent: false },
    final: { kind: 'completed' },
  }
}

test('builds per-round tokens and a confirmation split', () => {
  const metrics = buildRunMetrics({
    summary: summary(),
    rounds: [
      { kind: 'initial', turn: 1 },
      { kind: 'confirmation', turn: 2 },
    ],
    fixtureId: 'demo',
    arm: 'plugin',
  })

  assert.equal(metrics.tokens.totalTokens, 1230)
  assert.equal(metrics.tokens.confirmationRounds.totalTokens, 510)
  assert.equal(metrics.tokens.confirmationAck.totalTokens, 105)
  assert.equal(metrics.tokens.work.totalTokens, 1125)
  assert.equal(metrics.confirmationRounds, 1)
  assert.equal(metrics.rounds.length, 2)
  assert.equal(metrics.rounds[1].kind, 'confirmation')
  assert.equal(metrics.friction.expectedConfirmations, 1)
  assert.equal(metrics.friction.unexpectedInterventions, 2)
  assert.equal(metrics.friction.retries, 1)
  assert.equal(metrics.friction.resultErrors, 1)
})

test('keeps confirmation usage visible when no confirmation round exists', () => {
  const metrics = buildRunMetrics({
    summary: summary(),
    rounds: [{ kind: 'initial', turn: 1 }],
    fixtureId: 'demo',
    arm: 'official',
  })

  assert.equal(metrics.tokens.confirmationRounds.totalTokens, 0)
  assert.equal(metrics.tokens.confirmationAck.totalTokens, 0)
  assert.equal(metrics.tokens.work.totalTokens, 1230)
  assert.equal(metrics.friction.expectedConfirmations, 0)
})

test('counts no acknowledgment when the confirmation round starts with a tool call', () => {
  const data = summary()
  data.perTurn[1].stepDetails[0].hasToolCall = true

  const metrics = buildRunMetrics({
    summary: data,
    rounds: [
      { kind: 'initial', turn: 1 },
      { kind: 'confirmation', turn: 2 },
    ],
    fixtureId: 'demo',
    arm: 'plugin',
  })

  assert.equal(metrics.tokens.confirmationAck.totalTokens, 0)
  assert.equal(metrics.tokens.work.totalTokens, 1230)
})

test('computes quantiles and medians', () => {
  assert.equal(median([1, 2, 3]), 2)
  assert.equal(quantile([0, 10], 0.25), 2.5)
  assert.equal(iqr([1, 2, 3, 4]), 1.5)
  assert.ok(Number.isNaN(median([])))
})

test('aggregates arms per fixture and flags indistinguishable variance', () => {
  const run = (arm, totals, valid = true) => ({
    fixtureId: 'demo',
    arm,
    valid,
    metrics: {
      tokens: {
        totalTokens: totals,
        work: { totalTokens: totals },
      },
      friction: { steps: 10, toolCalls: 5, resultBytes: 100, durationMs: 1000 },
    },
  })

  const separated = aggregateRuns([
    run('official', 1000),
    run('official', 1100),
    run('official', 1200),
    run('plugin', 800),
    run('plugin', 850),
    run('plugin', 900),
  ])
  const demo = separated.fixtures.find((fixture) => fixture.fixtureId === 'demo')
  assert.ok(demo.comparison.tokenRatio.ratio < 1)
  assert.equal(demo.arms.official.medianTotalTokens, 1100)
  assert.equal(demo.arms.plugin.medianTotalTokens, 850)
  assert.equal(demo.arms.official.medianWorkTokens, 1100)

  const noisy = aggregateRuns([
    run('official', 1000),
    run('official', 2000),
    run('official', 3000),
    run('plugin', 900),
    run('plugin', 2100),
    run('plugin', 1500),
  ])
  const noisyDemo = noisy.fixtures.find((fixture) => fixture.fixtureId === 'demo')
  assert.equal(noisyDemo.comparison.indistinguishable, true)
})

test('drops invalid runs from aggregates but counts them', () => {
  const valid = (arm, total, isValid) => ({
    fixtureId: 'demo',
    arm,
    valid: isValid,
    metrics: {
      tokens: { totalTokens: total, work: { totalTokens: total } },
      friction: { steps: 1, toolCalls: 1, resultBytes: 0, durationMs: 1 },
    },
  })
  const result = aggregateRuns([
    valid('official', 100, true),
    valid('official', 200, false),
    valid('plugin', 50, true),
  ])
  const demo = result.fixtures[0]
  assert.equal(demo.arms.official.runs, 2)
  assert.equal(demo.arms.official.validRuns, 1)
  assert.equal(demo.arms.official.medianTotalTokens, 100)
})
