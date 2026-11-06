/**
 * Turn a session summary plus round metadata into run metrics and aggregates.
 *
 * No score is collapsed into a single "friction" number: the vector is kept so
 * a report can show which operation changed. Token totals include every round;
 * the confirmation split is an additional view, never a silent subtraction.
 *
 * @module eval/lib/metrics
 */

import { usageForTurns } from './session.mjs'

const USAGE_KEYS = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens', 'totalTokens']

function emptyUsage() {
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0 }
}

function addUsage(target, usage) {
  for (const key of USAGE_KEYS) target[key] += Number(usage?.[key] ?? 0)
  return target
}

/**
 * Build one run's metrics from a session summary and its rounds.
 * @param options - summary, rounds, fixture id and arm.
 * @returns the run metrics.
 */
export function buildRunMetrics({ summary, rounds, fixtureId, arm }) {
  const normalizedRounds = rounds.map((round, index) => ({
    index,
    kind: round.kind ?? 'work',
    turn: round.turn ?? index + 1,
    exitCode: round.exitCode ?? null,
    timedOut: round.timedOut === true,
    stalled: round.stalled === true,
    message: round.message ?? '',
  }))
  const confirmationTurns = normalizedRounds
    .filter((round) => round.kind === 'confirmation')
    .map((round) => round.turn)
  const confirmationUsage = usageForTurns(summary, confirmationTurns)
  const confirmationAckUsage = emptyUsage()
  for (const round of normalizedRounds) {
    if (round.kind !== 'confirmation') continue
    const turn = summary.perTurn.find((entry) => entry.turn === round.turn)
    const steps = turn?.stepDetails ?? []
    const firstTool = steps.findIndex((step) => step.hasToolCall)
    const ackSteps = firstTool === -1 ? steps : steps.slice(0, firstTool)
    for (const step of ackSteps) {
      if (step.usage) addUsage(confirmationAckUsage, step.usage)
    }
  }
  const workUsage = emptyUsage()
  for (const key of USAGE_KEYS) {
    workUsage[key] = summary.usage[key] - confirmationAckUsage[key]
  }

  const promptTokens = summary.prompt.totalRequestTokens
  const byRound = normalizedRounds.map((round) => {
    const turn = summary.perTurn.find((entry) => entry.turn === round.turn)
    return {
      index: round.index,
      kind: round.kind,
      turn: round.turn,
      usage: turn?.usage ?? emptyUsage(),
      steps: turn?.steps ?? 0,
      exitCode: round.exitCode,
      timedOut: round.timedOut,
      stalled: round.stalled,
    }
  })

  return {
    fixtureId,
    arm,
    sessionId: summary.sessionId,
    model: summary.model,
    rounds: byRound,
    confirmationRounds: normalizedRounds.filter((round) => round.kind === 'confirmation').length,
    tokens: {
      ...summary.usage,
      promptTokens,
      work: workUsage,
      confirmationRounds: confirmationUsage,
      confirmationAck: confirmationAckUsage,
    },
    prompt: summary.prompt,
    friction: {
      steps: summary.steps,
      turns: summary.turns,
      toolCalls: summary.tools.calls,
      byTool: summary.tools.byTool,
      openspecCliCalls: summary.tools.openspecCliCalls,
      openspecActions: summary.tools.actions,
      skillLoads: summary.skills.loaded,
      resultBytes: summary.tools.resultBytes,
      resultBytesByTool: summary.tools.resultBytesByTool,
      resultErrors: summary.tools.resultErrors,
      retries: summary.retries,
      compactions: summary.compactions,
      durationMs: summary.durationMs,
      unexpectedInterventions: summary.tools.askUserQuestions,
      expectedConfirmations: normalizedRounds.filter((round) => round.kind === 'confirmation').length,
      timedOutRounds: normalizedRounds.filter((round) => round.timedOut).length,
      stalledRounds: normalizedRounds.filter((round) => round.stalled).length,
    },
    missingUsage: summary.missingUsage,
    toolSurface: summary.toolSurface,
    skills: summary.skills,
    final: summary.final,
  }
}

/**
 * Linear-interpolated quantile.
 * @param values - numbers.
 * @param q - quantile in [0, 1].
 * @returns the quantile.
 */
export function quantile(values, q) {
  if (values.length === 0) return Number.NaN
  const sorted = [...values].sort((left, right) => left - right)
  const position = (sorted.length - 1) * q
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
}

/** Median of a numeric sample. */
export function median(values) {
  return quantile(values, 0.5)
}

/** Interquartile range of a numeric sample. */
export function iqr(values) {
  if (values.length === 0) return Number.NaN
  return quantile(values, 0.75) - quantile(values, 0.25)
}

function mulberry32(seed) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function resample(values, random) {
  const result = []
  for (let index = 0; index < values.length; index += 1) {
    result.push(values[Math.floor(random() * values.length)])
  }
  return result
}

/**
 * Bootstrap the ratio of two medians.
 * @param numerator - plugin values.
 * @param denominator - official values.
 * @param iterations - resamples.
 * @param seed - deterministic seed.
 * @returns the point ratio and percentile interval.
 */
export function bootstrapRatio(numerator, denominator, iterations = 2000, seed = 20261106) {
  const point = median(numerator) / median(denominator)
  if (numerator.length < 2 || denominator.length < 2 || !Number.isFinite(point)) {
    return { ratio: point, low: Number.NaN, high: Number.NaN }
  }
  const random = mulberry32(seed)
  const sampled = []
  for (let index = 0; index < iterations; index += 1) {
    const left = median(resample(numerator, random))
    const right = median(resample(denominator, random))
    if (right !== 0 && Number.isFinite(left) && Number.isFinite(right)) sampled.push(left / right)
  }
  return { ratio: point, low: quantile(sampled, 0.025), high: quantile(sampled, 0.975) }
}

function valuesFor(runs, arm, selector) {
  return runs.filter((run) => run.arm === arm && run.valid !== false).map(selector).filter(Number.isFinite)
}

/**
 * Compare the two arms per fixture.
 * @param runs - completed run metrics.
 * @returns per-fixture arm statistics and comparisons.
 */
export function aggregateRuns(runs) {
  const fixtureIds = [...new Set(runs.map((run) => run.fixtureId))]
  const fixtures = []
  for (const fixtureId of fixtureIds) {
    const scoped = runs.filter((run) => run.fixtureId === fixtureId)
    const arms = {}
    for (const arm of ['official', 'plugin']) {
      const armRuns = scoped.filter((run) => run.arm === arm)
      const valid = armRuns.filter((run) => run.valid !== false)
      const totals = valid.map((run) => run.metrics.tokens.totalTokens)
      const work = valid.map((run) => run.metrics.tokens.work.totalTokens)
      arms[arm] = {
        runs: armRuns.length,
        validRuns: valid.length,
        medianTotalTokens: median(totals),
        iqrTotalTokens: iqr(totals),
        medianWorkTokens: median(work),
        iqrWorkTokens: iqr(work),
        medianSteps: median(valid.map((run) => run.metrics.friction.steps)),
        medianToolCalls: median(valid.map((run) => run.metrics.friction.toolCalls)),
        medianResultBytes: median(valid.map((run) => run.metrics.friction.resultBytes)),
        medianDurationMs: median(valid.map((run) => run.metrics.friction.durationMs)),
      }
    }
    const pluginTotals = valuesFor(scoped, 'plugin', (run) => run.metrics.tokens.totalTokens)
    const officialTotals = valuesFor(scoped, 'official', (run) => run.metrics.tokens.totalTokens)
    const pluginWork = valuesFor(scoped, 'plugin', (run) => run.metrics.tokens.work.totalTokens)
    const officialWork = valuesFor(scoped, 'official', (run) => run.metrics.tokens.work.totalTokens)
    const tokenRatio = bootstrapRatio(pluginTotals, officialTotals)
    const workRatio = bootstrapRatio(pluginWork, officialWork)
    const spread = Math.max(
      arms.plugin?.iqrTotalTokens ?? 0,
      arms.official?.iqrTotalTokens ?? 0,
    )
    const difference = Math.abs(
      (arms.plugin?.medianTotalTokens ?? 0) - (arms.official?.medianTotalTokens ?? 0),
    )
    const indistinguishable =
      !Number.isFinite(tokenRatio.low) ||
      (tokenRatio.low <= 1 && tokenRatio.high >= 1) ||
      difference <= spread
    fixtures.push({
      fixtureId,
      arms,
      comparison: {
        tokenRatio,
        workRatio,
        difference,
        spread,
        indistinguishable,
      },
    })
  }
  return { fixtures }
}
