import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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
    stepDetails: [{ step: 1, usage: usage(total / turns), hasToolCall: true }],
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
    concurrency: 1,
    out,
    home: join(out, '.dsh-home'),
    agentsHome: join(out, '.agents-home'),
    sourceHome: join(out, '.source'),
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
    createEvalHome: ({ root, agentsRoot }) => ({
      dshHome: root ?? join(out, '.dsh-home'),
      agentsHome: agentsRoot ?? join(out, '.agents-home'),
    }),
    cleanupEvalHome: () => {},
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
  assert.equal(run.metrics.tokens.confirmationRounds.totalTokens, 750)
  assert.equal(run.metrics.tokens.confirmationAck.totalTokens, 0)
  assert.equal(run.metrics.tokens.work.totalTokens, 1000)
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

test('creates and cleans one private home at the default concurrency', async (t) => {
  const out = mkdtempSync(join(tmpdir(), 'eval-matrix-'))
  t.after(() => rmSync(out, { recursive: true, force: true }))
  const { deps } = depsFor({ out, stages: ['archived'] })
  const calls = []
  deps.createEvalHome = ({ root }) => {
    calls.push(`create:${root}`)
    return { dshHome: root, agentsHome: `${root}-agents` }
  }
  deps.cleanupEvalHome = ({ dshHome }) => calls.push(`cleanup:${dshHome}`)

  await runMatrix(baseConfig(out), deps)

  assert.deepEqual(calls, [
    `create:${join(out, '.dsh-home')}`,
    `cleanup:${join(out, '.dsh-home')}`,
  ])
})

test('uses and removes a real private home', async (t) => {
  const out = mkdtempSync(join(tmpdir(), 'eval-matrix-'))
  t.after(() => rmSync(out, { recursive: true, force: true }))
  const source = join(out, 'source')
  const dshHome = join(out, 'dsh')
  const agentsHome = join(out, 'agents')
  mkdirSync(source, { recursive: true })
  writeFileSync(join(source, '.credentials.yaml'), 'deepseek:\n  token: test\n')

  const { deps } = depsFor({ out, stages: ['archived'] })
  delete deps.createEvalHome
  delete deps.cleanupEvalHome

  const config = {
    ...baseConfig(join(out, 'runs')),
    arms: ['official'],
    runs: 1,
    home: dshHome,
    agentsHome,
    sourceHome: source,
    keepHome: false,
  }
  await runMatrix(config, deps)

  assert.equal(existsSync(dshHome), false)
  assert.equal(existsSync(agentsHome), false)
  assert.equal(existsSync(source), true)
})

test('runs two workers with distinct homes and environments', async (t) => {
  const out = mkdtempSync(join(tmpdir(), 'eval-matrix-'))
  t.after(() => rmSync(out, { recursive: true, force: true }))
  const { deps } = depsFor({ out, stages: ['archived'] })
  const created = []
  const cleaned = []
  const environments = new Set()
  deps.createEvalHome = ({ root, agentsRoot }) => {
    const home = { dshHome: root, agentsHome: agentsRoot }
    created.push(home)
    return home
  }
  deps.cleanupEvalHome = ({ dshHome }) => cleaned.push(dshHome)
  const run = deps.runRound
  deps.runRound = async (options) => {
    environments.add(options.env.DSH_HOME)
    return run(options)
  }

  const result = await runMatrix({ ...baseConfig(out), concurrency: 2 }, deps)

  assert.equal(created.length, 2)
  assert.equal(new Set(created.map((home) => home.dshHome)).size, 2)
  assert.deepEqual(cleaned.sort(), created.map((home) => home.dshHome).sort())
  assert.equal(environments.size, 2)
  assert.equal(result.runs.length, 4)
  assert.deepEqual([...new Set(result.runs.map((entry) => entry.worker))].sort(), [0, 1])
})
