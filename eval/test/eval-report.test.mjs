import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { writeReport } from '../lib/report.mjs'

function run(fixtureId, arm, replicate, total, { valid = true, gates = [], confirmationRound = 100, confirmationAck = 40 } = {}) {
  return {
    runId: `${fixtureId}-${arm}-${replicate}`,
    runDir: `/tmp/runs/${fixtureId}-${arm}-${replicate}`,
    fixtureId,
    arm,
    replicate,
    worker: 0,
    wallMs: 1000,
    valid,
    gates,
    sessionId: `session-${fixtureId}-${arm}-${replicate}`,
    metrics: {
      missingUsage: [],
      tokens: {
        totalTokens: total,
        work: { totalTokens: total - confirmationAck },
        confirmationRounds: { totalTokens: confirmationRound },
        confirmationAck: { totalTokens: confirmationAck },
      },
      friction: {
        steps: 5,
        toolCalls: 3,
        openspecCliCalls: 1,
        resultBytes: 120,
        durationMs: 1000,
        expectedConfirmations: 1,
        unexpectedInterventions: 0,
        timedOutRounds: 0,
        stalledRounds: 0,
      },
    },
  }
}

test('writes per-run and aggregate sections with artifact paths', (t) => {
  const outDir = mkdtempSync(join(tmpdir(), 'eval-report-'))
  t.after(() => rmSync(outDir, { recursive: true, force: true }))

  const runs = []
  for (const total of [1000, 1100, 1200]) runs.push(run('separated', 'official', runs.length, total))
  for (const total of [800, 850, 900]) runs.push(run('separated', 'plugin', runs.length, total))
  for (const total of [1000, 2000, 3000]) runs.push(run('noisy', 'official', runs.length, total))
  for (const total of [900, 2100, 1500]) runs.push(run('noisy', 'plugin', runs.length, total))
  runs.push(
    run('separated', 'official', 9, 999, {
      valid: false,
      gates: [{ name: 'repo-tests', passed: false, detail: 'exit 1' }],
    }),
  )

  const config = {
    fixtures: ['separated', 'noisy'],
    arms: ['official', 'plugin'],
    runs: 3,
    out: outDir,
    timeoutMs: 45 * 60 * 1000,
    budgetTokensPerRun: 8_000_000,
    model: { provider: 'deepseek-account', model: 'deepseek-flash', reasoningEffort: 'high' },
  }
  const result = writeReport({
    outDir,
    config,
    runs,
    startedAt: '2026-11-06T00:00:00.000Z',
    finishedAt: '2026-11-06T01:00:00.000Z',
  })

  const markdown = readFileSync(result.reportPath, 'utf8')
  assert.match(markdown, /# Real-model OpenSpec evaluation/u)
  assert.match(markdown, /## Aggregate/u)
  assert.match(markdown, /## Comparison/u)
  assert.match(markdown, /## Runs/u)
  assert.match(markdown, /Work tokens/u)
  assert.match(markdown, /Worker \| Wall/u)
  assert.match(markdown, /Work token ratio/u)
  assert.match(markdown, /## Confirmations/u)
  assert.match(markdown, /plugin lower/u)
  assert.match(markdown, /indistinguishable/u)
  assert.match(markdown, /repo-tests/u)
  assert.match(markdown, /separated-official-0/u)

  const json = JSON.parse(readFileSync(result.jsonPath, 'utf8'))
  assert.equal(json.runs.length, runs.length)
  assert.equal(json.aggregates.fixtures.length, 2)
  assert.equal(json.config.model.model, 'deepseek-flash')
})

test('reports plugin provenance when git metadata is absent', (t) => {
  const outDir = mkdtempSync(join(tmpdir(), 'eval-report-'))
  t.after(() => rmSync(outDir, { recursive: true, force: true }))

  const runs = []
  for (const total of [1000, 1100, 1200]) runs.push(run('separated', 'official', runs.length, total))
  for (const total of [800, 850, 900]) runs.push(run('separated', 'plugin', runs.length, total))
  runs[0].plugin = { root: '/tmp/plugin', version: '0.1.0', commit: null, dirty: true }

  const result = writeReport({
    outDir,
    config: {
      fixtures: ['separated'],
      arms: ['official', 'plugin'],
      runs: 3,
      out: outDir,
      timeoutMs: 45 * 60 * 1000,
      budgetTokensPerRun: 8_000_000,
      model: { provider: 'deepseek-account', model: 'deepseek-flash', reasoningEffort: 'high' },
    },
    runs,
    startedAt: '2026-11-06T00:00:00.000Z',
    finishedAt: '2026-11-06T01:00:00.000Z',
  })

  const markdown = readFileSync(result.reportPath, 'utf8')
  assert.match(markdown, /Plugin: 0\.1\.0 at no git metadata \(dirty\); root \/tmp\/plugin/u)
})
