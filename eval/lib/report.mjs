/**
 * Per-run and aggregate reporting.
 *
 * The Markdown report never prints a saving without the run table and the
 * interval that produced it. The JSON report keeps the complete run records so
 * a reader can recompute every number.
 *
 * @module eval/lib/report
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { aggregateRuns } from './metrics.mjs'

function number(value) {
  if (!Number.isFinite(value)) return '—'
  return Math.round(value).toLocaleString('en-US')
}

function ratio(value) {
  if (!Number.isFinite(value)) return '—'
  return value.toFixed(2)
}

function interval(comparison) {
  if (!Number.isFinite(comparison.low) || !Number.isFinite(comparison.high)) return '—'
  return `[${comparison.low.toFixed(2)}, ${comparison.high.toFixed(2)}]`
}

function verdict(comparison) {
  if (comparison.indistinguishable) return 'indistinguishable'
  return comparison.tokenRatio.ratio < 1 ? 'plugin lower' : 'plugin higher'
}

function failedGates(run) {
  return (run.gates ?? []).filter((gate) => gate.passed === false).map((gate) => gate.name)
}

/**
 * Render the Markdown report.
 * @param options - configuration, runs, aggregates and timing.
 * @returns Markdown text.
 */
export function renderMarkdown({ config, runs, aggregates, startedAt, finishedAt }) {
  const lines = []
  lines.push('# Real-model OpenSpec evaluation')
  lines.push('')
  lines.push(`- Started: ${startedAt}`)
  lines.push(`- Finished: ${finishedAt}`)
  lines.push(`- Fixtures: ${config.fixtures.join(', ')}`)
  lines.push(`- Arms: ${config.arms.join(', ')}`)
  lines.push(`- Runs per fixture and arm: ${config.runs}`)
  lines.push(`- Model: ${config.model.provider}/${config.model.model}, effort ${config.model.reasoningEffort}`)
  lines.push(`- Timeout: ${config.timeoutMs / 60_000} min; budget: ${number(config.budgetTokensPerRun)} tokens per run`)
  lines.push('')

  lines.push('## Aggregate')
  lines.push('')
  lines.push(
    '| Fixture | Arm | Valid/Total | Median tokens | IQR | Median core | Median steps | Median tool calls | Median result bytes | Median duration (s) |',
  )
  lines.push('| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |')
  for (const fixture of aggregates.fixtures) {
    for (const arm of ['official', 'plugin']) {
      const entry = fixture.arms[arm]
      if (entry === undefined) continue
      lines.push(
        `| ${fixture.fixtureId} | ${arm} | ${entry.validRuns}/${entry.runs} | ${number(entry.medianTotalTokens)} | ${number(entry.iqrTotalTokens)} | ${number(entry.medianCoreTokens)} | ${number(entry.medianSteps)} | ${number(entry.medianToolCalls)} | ${number(entry.medianResultBytes)} | ${(entry.medianDurationMs / 1000).toFixed(1)} |`,
      )
    }
  }
  lines.push('')

  lines.push('## Comparison')
  lines.push('')
  lines.push('| Fixture | Plugin / official tokens | 95% CI | Difference | Spread | Result | Core token ratio |')
  lines.push('| --- | ---: | --- | ---: | ---: | --- | ---: |')
  for (const fixture of aggregates.fixtures) {
    const comparison = fixture.comparison
    lines.push(
      `| ${fixture.fixtureId} | ${ratio(comparison.tokenRatio.ratio)} | ${interval(comparison.tokenRatio)} | ${number(comparison.difference)} | ${number(comparison.spread)} | ${verdict(comparison)} | ${ratio(comparison.coreRatio.ratio)} |`,
    )
  }
  lines.push('')

  lines.push('## Runs')
  lines.push('')
  lines.push(
    '| Fixture | Arm | Rep | Valid | Total tokens | Core tokens | Confirmation tokens | Steps | Tool calls | CLI calls | Result bytes | Missing usage | Gates failed | Session |',
  )
  lines.push('| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |')
  for (const run of runs) {
    const metrics = run.metrics
    const failed = failedGates(run)
    lines.push(
      `| ${run.fixtureId} | ${run.arm} | ${run.replicate} | ${run.valid ? 'yes' : 'no'} | ${number(metrics.tokens.totalTokens)} | ${number(metrics.tokens.core.totalTokens)} | ${number(metrics.tokens.confirmation.totalTokens)} | ${number(metrics.friction.steps)} | ${number(metrics.friction.toolCalls)} | ${number(metrics.friction.openspecCliCalls)} | ${number(metrics.friction.resultBytes)} | ${metrics.missingUsage.length === 0 ? '—' : metrics.missingUsage.map((entry) => `${entry.turn}.${entry.step}`).join(' ')} | ${failed.length === 0 ? '—' : failed.join(', ')} | ${run.sessionId ?? '—'} |`,
    )
  }
  lines.push('')

  lines.push('## Confirmations')
  lines.push('')
  lines.push('| Fixture | Arm | Rep | Expected rounds | Unexpected questions | Timed-out rounds | Stalled rounds |')
  lines.push('| --- | --- | ---: | ---: | ---: | ---: | ---: |')
  for (const run of runs) {
    const friction = run.metrics.friction
    lines.push(
      `| ${run.fixtureId} | ${run.arm} | ${run.replicate} | ${friction.expectedConfirmations} | ${friction.unexpectedInterventions} | ${friction.timedOutRounds} | ${friction.stalledRounds} |`,
    )
  }
  lines.push('')

  lines.push('## Artifacts')
  lines.push('')
  lines.push(`- Run artifacts: \`${config.out}\``)
  for (const run of runs) {
    lines.push(`- ${run.runId}: \`${run.runDir}\``)
  }
  lines.push('')
  lines.push('## Reading notes')
  lines.push('')
  lines.push('- Token totals include every round; the confirmation column is an additional view, not a silent subtraction.')
  lines.push('- A fixture is labelled indistinguishable when the 95% interval includes 1 or the difference is smaller than the larger IQR.')
  lines.push('- Invalid runs stay in the table and are excluded from the aggregate medians.')
  lines.push('')
  return `${lines.join('\n')}`
}

/**
 * Write both report files.
 * @param options - output directory, configuration, runs and timing.
 * @returns report paths and aggregates.
 */
export function writeReport({ outDir, config, runs, startedAt, finishedAt }) {
  const aggregates = aggregateRuns(runs)
  const markdown = renderMarkdown({ config, runs, aggregates, startedAt, finishedAt })
  const reportPath = join(outDir, 'report.md')
  const jsonPath = join(outDir, 'report.json')
  writeFileSync(reportPath, markdown)
  writeFileSync(
    jsonPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        startedAt,
        finishedAt,
        config: {
          fixtures: config.fixtures,
          arms: config.arms,
          runs: config.runs,
          model: config.model,
          timeoutMs: config.timeoutMs,
          budgetTokensPerRun: config.budgetTokensPerRun,
        },
        runs,
        aggregates,
      },
      null,
      2,
    )}\n`,
  )
  return { reportPath, jsonPath, aggregates }
}
