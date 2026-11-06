import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { runMatrix } from '../lib/matrix.mjs'

function usage(total) {
  return {
    inputTokens: total,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    totalTokens: total,
  }
}

function summary(arm, total = 1000, turns = 1) {
  const perTurn = Array.from({ length: turns }, (_, index) => ({
    turn: index + 1,
    usage: usage(total / turns),
    steps: 1,
  }))
  const openspecTools =
    arm === 'plugin' ? Array.from({ length: 13 }, (_, index) => `openspec_tool_${index}`) : []
  return {
    sessionId: 'session-test',
    model: { provider: 'deepseek-account', model: 'deepseek-flash' },
    usage: usage(total),
    prompt: { firstRequestTokens: total, peakRequestTokens: total, totalRequestTokens: total * turns },
    perTurn,
    steps: turns,
    turns,
    tools: {
      calls: 1,
      byTool: { bash: 1 },
      cliCommands: [],
      openspecCliCalls: 0,
      actions: [],
      skillLoads: [],
      results: 1,
      resultBytes: 10,
      resultBytesByTool: {},
      resultErrors: 0,
      askUserQuestions: 0,
    },
    skills: { catalog: [], loaded: [] },
    retries: 0,
    compactions: 0,
    durationMs: 1,
    missingUsage: [],
    toolSurface: {
      count: 24 + openspecTools.length,
      names: ['bash', 'web_search', 'web_fetch', ...openspecTools],
      openspecTools,
      hasWeb: true,
      hasSubagent: false,
    },
    final: { kind: 'completed' },
  }
}

function baseConfig(out) {
  return {
    fixtures: ['budget-cli'],
    arms: ['official', 'plugin'],
    runs: 2,
    out,
    timeoutMs: 60_000,
    maxRounds: 5,
    budgetTokensPerRun: 1_000_000,
    permissionMode: 'workspace-write',
    approvalPolicy: 'never',
    model: { provider: 'deepseek-account', model: 'deepseek-flash', reasoningEffort: 'high' },
    confirmations: {
      create: '确认。请创建该变更并继续。',
      apply: '确认，开始实施。',
      archive: '请归档该变更并完成。',
    },
  }
}

function depsFor({ out, stages, total = 1000, state = {} }) {
  let stageIndex = 0
  let roundsSeen = 0
  const preparedArms = []
  const roundMessages = []
  const fakeState = { arm: 'official', ...state }
  const deps = {
    preflight: () => [],
    ensureOfficialSkills: () => join(out, 'official-skills'),
    prepareFixture: ({ arm }) => {
      preparedArms.push(arm)
      fakeState.arm = arm
      stageIndex = 0
      roundsSeen = 0
      return { commit: 'abc', request: 'Implement the feature.' }
    },
    runRound: async ({ task }) => {
      roundMessages.push(task)
      roundsSeen += 1
      return {
        index: 0,
        exitCode: 0,
        timedOut: false,
        error: null,
        sessionId: 'session-test',
        events: [],
        final: { reason: { kind: 'completed' } },
        durationMs: 1,
      }
    },
    loadSession: () => {
      const stage = stages[Math.min(stageIndex, stages.length - 1)]
      return summary(fakeState.arm, total, Math.max(1, roundsSeen))
    },
    inspectStage: () => {
      const stage = stages[Math.min(stageIndex, stages.length - 1)]
      stageIndex += 1
      return {
        stage,
        change: stage === 'no-change' ? null : 'add-budget-report',
        archivedAs: stage === 'archived' ? '2026-11-06-add-budget-report' : null,
        tasks: { total: 3, checked: stage === 'applied' || stage === 'archived' ? 3 : 0, unchecked: 0 },
        artifacts: { present: [], hasSpecs: false, complete: false },
      }
    },
    runGates: () => ({ passed: true, gates: [{ name: 'all', passed: true }] }),
    acceptanceDir: () => null,
    copySession: () => {},
    gitDiff: () => '',
    now: () => new Date('2026-11-06T00:00:00.000Z'),
  }
  return { deps, preparedArms, roundMessages }
}

test('runs the ABBA matrix and writes a complete report', async (t) => {
  const out = mkdtempSync(join(tmpdir(), 'eval-matrix-'))
  t.after(() => rmSync(out, { recursive: true, force: true }))
  const { deps, preparedArms } = depsFor({ out, stages: ['archived'] })

  const result = await runMatrix(baseConfig(out), deps)

  assert.deepEqual(preparedArms, ['official', 'plugin', 'plugin', 'official'])
  assert.equal(result.runs.length, 4)
  assert.equal(result.runs.every((run) => run.valid), true)
  assert.equal(existsSync(join(out, 'report.md')), true)
  assert.equal(existsSync(join(out, 'report.json')), true)
  assert.equal(existsSync(join(result.runs[0].runDir, 'run.json')), true)
  assert.match(readFileSync(join(out, 'report.md'), 'utf8'), /## Comparison/u)
})

test('marks confirmation rounds and splits their tokens', async (t) => {
  const out = mkdtempSync(join(tmpdir(), 'eval-matrix-'))
  t.after(() => rmSync(out, { recursive: true, force: true }))
  const { deps } = depsFor({
    out,
    stages: ['no-change', 'created', 'applied', 'archived'],
    total: 1000,
  })

  const result = await runMatrix(baseConfig(out), deps)
  const run = result.runs[0]
  assert.equal(run.rounds.length, 4)
  assert.equal(run.rounds[1].message, '确认。请创建该变更并继续。')
  assert.equal(run.rounds[2].message, '确认，开始实施。')
  assert.equal(run.rounds[3].message, '请归档该变更并完成。')
  assert.equal(run.metrics.confirmationRounds, 3)
  assert.equal(run.metrics.tokens.confirmation.totalTokens, 750)
  assert.equal(run.metrics.tokens.core.totalTokens, 250)
})

test('stops a stalled run and marks it invalid', async (t) => {
  const out = mkdtempSync(join(tmpdir(), 'eval-matrix-'))
  t.after(() => rmSync(out, { recursive: true, force: true }))
  const { deps } = depsFor({ out, stages: ['no-change'] })

  const result = await runMatrix(baseConfig(out), deps)
  const run = result.runs[0]
  assert.equal(run.stalled, true)
  assert.equal(run.valid, false)
  assert.equal(run.rounds.length, 2)
})
