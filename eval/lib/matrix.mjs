/**
 * Matrix orchestration: prepare a fixture, drive the full flow, verify,
 * measure and report. Dependencies are injectable so the whole path can be
 * tested without a model call.
 *
 * @module eval/lib/matrix
 */

import { spawnSync } from 'node:child_process'
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { planCells } from './config.mjs'
import { acceptanceDir, fixtureById } from './registry.mjs'
import {
  ensureOfficialSkills as ensureOfficialSkillsImpl,
  prepareFixture as prepareFixtureImpl,
} from './fixtures.mjs'
import { assertToolSurface, patchesForArm, preflight as preflightImpl } from './profile.mjs'
import { runRound as runRoundImpl } from './runner.mjs'
import { findSessionDir as findSessionDirImpl, loadSession as loadSessionImpl } from './session.mjs'
import {
  classifyRound,
  hasProgress,
  inspectStage as inspectStageImpl,
  nextMessage,
} from './flow.mjs'
import { runGates as runGatesImpl } from './verify.mjs'
import { buildRunMetrics } from './metrics.mjs'
import { writeReport as writeReportImpl } from './report.mjs'
import { CACHE_ROOT, OPENSPEC_BIN } from './paths.mjs'

const OPERATING_RULES = `

## Operating rules

- Work autonomously. Do not ask the user questions; make reasonable assumptions and record them.
- The user confirms the change name and the start of apply when prompted.
- Do not edit implementation code before the apply confirmation.
- Archive only when the user asks.`

function emptySummary() {
  return {
    sessionId: null,
    model: null,
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0 },
    prompt: { firstRequestTokens: 0, peakRequestTokens: 0, totalRequestTokens: 0 },
    perTurn: [],
    steps: 0,
    turns: 0,
    tools: {
      calls: 0,
      byTool: {},
      cliCommands: [],
      openspecCliCalls: 0,
      actions: [],
      skillLoads: [],
      results: 0,
      resultBytes: 0,
      resultBytesByTool: {},
      resultErrors: 0,
      askUserQuestions: 0,
    },
    skills: { catalog: [], loaded: [] },
    retries: 0,
    compactions: 0,
    durationMs: 0,
    missingUsage: [],
    toolSurface: { count: 0, names: [], openspecTools: [], hasWeb: false, hasSubagent: false },
    final: null,
  }
}

function defaultCopySession(sessionId, target) {
  if (sessionId === null) return
  const directory = findSessionDirImpl(sessionId)
  copyFileSync(join(directory, 'session.v4.jsonl.zstd'), target)
}

function defaultGitDiff(destination) {
  const result = spawnSync('git', ['diff', '--binary'], { cwd: destination, encoding: 'utf8' })
  return result.stdout ?? ''
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

/**
 * Run one cell.
 * @returns the run record.
 */
async function runCell({
  config,
  fixture,
  arm,
  replicate,
  timestamp,
  officialSkillsDir,
  deps,
}) {
  const runId = `${timestamp}-${fixture.id}-${arm}-r${replicate}`
  const runDir = join(config.out, runId)
  const fixtureDir = join(runDir, 'fixture')
  const roundsDir = join(runDir, 'rounds')
  mkdirSync(roundsDir, { recursive: true })

  const record = {
    runId,
    runDir,
    fixtureId: fixture.id,
    arm,
    replicate,
    sessionId: null,
    commit: null,
    valid: false,
    aborted: false,
    stalled: false,
    budgetExceeded: false,
    surfaceIssues: [],
    gates: [],
    rounds: [],
    metrics: null,
    error: null,
  }

  try {
    const prepared = deps.prepareFixture({
      fixture,
      arm,
      destination: fixtureDir,
      officialSkillsDir,
      repoRoot: deps.repoRoot,
    })
    record.commit = prepared.commit
    const firstMessage = prepared.request + OPERATING_RULES
    const patches = patchesForArm(arm)
    const deadline = Date.now() + config.timeoutMs
    let message = firstMessage
    let sessionId = null
    let previousStage = 'no-change'
    let noProgress = 0

    for (let index = 0; index < config.maxRounds; index += 1) {
      const remaining = deadline - Date.now()
      if (remaining <= 0) {
        record.aborted = true
        break
      }
      const round = await deps.runRound({
        cwd: fixtureDir,
        task: message,
        patches,
        sessionId,
        permissionMode: config.permissionMode,
        approvalPolicy: config.approvalPolicy,
        timeoutMs: remaining,
        outDir: roundsDir,
        index,
        env: {
          PATH: `${dirname(OPENSPEC_BIN)}:${process.env.PATH ?? ''}`,
          OPENSPEC_TELEMETRY: '0',
          OPENSPEC_NO_UPDATE_CHECK: '1',
        },
      })
      sessionId = round.sessionId ?? sessionId
      const kind = index === 0 ? 'initial' : classifyRound(message, config.confirmations)
      const timedOut = round.timedOut === true
      record.rounds.push({
        index,
        kind,
        turn: index + 1,
        exitCode: round.exitCode,
        timedOut,
        message,
      })
      record.sessionId = sessionId

      if (timedOut || round.error !== null || round.exitCode !== 0) {
        record.aborted = true
        break
      }
      if (sessionId === null) {
        record.aborted = true
        break
      }

      const summary = deps.loadSession(sessionId)
      if (index === 0) {
        record.surfaceIssues = assertToolSurface(summary, arm)
        if (record.surfaceIssues.length > 0) break
      }
      if (summary.usage.totalTokens > config.budgetTokensPerRun) {
        record.budgetExceeded = true
        break
      }

      const stage = deps.inspectStage(fixtureDir, fixture.changeName)
      if (stage.stage === 'archived') break
      if (hasProgress(previousStage, stage.stage)) {
        noProgress = 0
      } else {
        noProgress += 1
      }
      if (noProgress >= 2) {
        record.stalled = true
        record.rounds.at(-1).stalled = true
        break
      }
      previousStage = stage.stage
      const next = nextMessage(stage.stage, config.confirmations)
      if (next === null) break
      message = next
    }

    const summary = sessionId === null ? emptySummary() : deps.loadSession(sessionId)
    record.gates = deps.runGates({
      destination: fixtureDir,
      changeName: fixture.changeName,
      outDir: join(runDir, 'gates'),
      acceptanceDir: deps.acceptanceDir(fixture),
      timeoutMs: Math.min(config.timeoutMs, 10 * 60 * 1000),
    }).gates ?? []
    record.metrics = buildRunMetrics({
      summary,
      rounds: record.rounds,
      fixtureId: fixture.id,
      arm,
    })
    record.valid =
      record.gates.every((gate) => gate.passed === true) &&
      !record.aborted &&
      !record.stalled &&
      !record.budgetExceeded &&
      record.surfaceIssues.length === 0 &&
      record.sessionId !== null &&
      record.rounds.length > 0 &&
      record.metrics.missingUsage.length === 0
    deps.copySession(sessionId, join(runDir, 'session.v4.jsonl.zstd'))
    writeFileSync(join(runDir, 'diff.patch'), deps.gitDiff(fixtureDir))
  } catch (error) {
    record.error = error.stack ?? error.message
    writeFileSync(join(runDir, 'error.log'), record.error)
    record.valid = false
    record.metrics ??= buildRunMetrics({
      summary: emptySummary(),
      rounds: record.rounds,
      fixtureId: fixture.id,
      arm,
    })
  }

  writeJson(join(runDir, 'run.json'), record)
  return record
}

/**
 * Run the complete matrix.
 * @param config - resolved configuration.
 * @param deps - injectable implementations for tests.
 * @returns report paths and run records.
 */
export async function runMatrix(config, deps = {}) {
  const resolved = {
    runRound: runRoundImpl,
    preflight: preflightImpl,
    prepareFixture: prepareFixtureImpl,
    ensureOfficialSkills: ensureOfficialSkillsImpl,
    loadSession: loadSessionImpl,
    inspectStage: inspectStageImpl,
    runGates: runGatesImpl,
    writeReport: writeReportImpl,
    acceptanceDir,
    copySession: defaultCopySession,
    gitDiff: defaultGitDiff,
    repoRoot: undefined,
    now: () => new Date(),
    ...deps,
  }

  for (const arm of config.arms) {
    const issues = resolved.preflight({ arm, model: config.model })
    if (issues.length > 0) {
      throw new Error(`preflight failed for ${arm}: ${issues.join('; ')}`)
    }
  }

  const officialSkillsDir = resolved.ensureOfficialSkills({
    cacheDir: join(CACHE_ROOT, 'official-skills'),
  })
  const startedAt = resolved.now().toISOString()
  const timestamp = startedAt.replace(/[:.]/gu, '-')
  mkdirSync(config.out, { recursive: true })
  const cellRuns = planCells(config)
  const runs = []

  for (const cell of cellRuns) {
    const fixture = fixtureById(cell.fixture)
    const record = await runCell({
      config,
      fixture,
      arm: cell.arm,
      replicate: cell.replicate,
      timestamp,
      officialSkillsDir,
      deps: resolved,
    })
    runs.push(record)
    process.stdout.write(
      `  ${record.runId} valid=${record.valid} tokens=${record.metrics?.tokens.totalTokens ?? 0}\n`,
    )
  }

  const finishedAt = resolved.now().toISOString()
  const report = resolved.writeReport({ outDir: config.out, config, runs, startedAt, finishedAt })
  return { ...report, runs }
}

export { OPERATING_RULES }
