/**
 * Correctness gates for one finished run.
 *
 * The gates are deliberately independent: a failing gate is reported with its
 * own log instead of hiding the others. Hidden acceptance is copied in only
 * after the repository test suite has run, so the fixture tests measure the
 * agent's own tests and the hidden tests measure behavior.
 *
 * @module eval/lib/verify
 */

import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { inspectStage } from './flow.mjs'
import { openspecBin as resolveOpenspecBin } from './paths.mjs'

function execute(command, args, { cwd, timeoutMs, env = {} }) {
  const childEnv = { ...process.env, ...env }
  // A nested `node --test` must not inherit the outer test runner's child mode.
  delete childEnv.NODE_TEST_CONTEXT
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
    env: childEnv,
  })
  return {
    status: result.status,
    signal: result.signal,
    error: result.error?.code ?? null,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

function writeLog(outDir, name, command, result) {
  const path = join(outDir, name)
  writeFileSync(
    path,
    `$ ${command}\n\nexit=${result.status} signal=${result.signal} error=${result.error}\n\n` +
      `--- stdout ---\n${result.stdout}\n\n--- stderr ---\n${result.stderr}\n`,
  )
  return path
}

function gate(name, passed, detail, logPath = null) {
  return { name, passed, detail, logPath }
}

/**
 * Run every correctness gate for a fixture.
 * @param options - destination, change name, output directory, acceptance and timeout.
 * @returns the gate results and the inspected stage.
 */
export function runGates({
  destination,
  changeName,
  outDir,
  acceptanceDir = null,
  openspecBin = resolveOpenspecBin(),
  timeoutMs = 120_000,
}) {
  mkdirSync(outDir, { recursive: true })
  const stage = inspectStage(destination, changeName)
  const gates = []

  gates.push(
    gate(
      'tasks',
      stage.tasks.total > 0 && stage.tasks.unchecked === 0,
      `${stage.tasks.checked}/${stage.tasks.total} checked`,
    ),
  )
  gates.push(
    gate(
      'archive',
      stage.stage === 'archived',
      stage.archivedAs ?? 'not archived',
    ),
  )

  const repoTestDir = join(destination, 'test')
  const repoTests = readdirSync(repoTestDir)
    .filter((name) => name.endsWith('.test.mjs'))
    .sort()
    .map((name) => join('test', name))
  const repo = execute('node', ['--test', ...repoTests], {
    cwd: destination,
    timeoutMs,
    env: { OPENSPEC_TELEMETRY: '0', OPENSPEC_NO_UPDATE_CHECK: '1' },
  })
  gates.push(
    gate(
      'repo-tests',
      repo.status === 0 && repo.error === null,
      repo.error ?? `exit ${repo.status}`,
      writeLog(outDir, 'repo-tests.log', `node --test ${repoTests.join(' ')}`, repo),
    ),
  )

  let hidden = gate('hidden-acceptance', true, 'no acceptance files')
  if (acceptanceDir !== null && existsSync(acceptanceDir)) {
    const files = readdirSync(acceptanceDir).filter((name) => name.endsWith('.mjs'))
    if (files.length > 0) {
      const targets = files.map((file) => {
        copyFileSync(join(acceptanceDir, file), join(destination, 'test', file))
        return join('test', file)
      })
      const result = execute('node', ['--test', ...targets], {
        cwd: destination,
        timeoutMs,
        env: { OPENSPEC_TELEMETRY: '0', OPENSPEC_NO_UPDATE_CHECK: '1' },
      })
      hidden = gate(
        'hidden-acceptance',
        result.status === 0 && result.error === null,
        result.error ?? `exit ${result.status}`,
        writeLog(outDir, 'hidden-tests.log', `node --test ${targets.join(' ')}`, result),
      )
    }
  }
  gates.push(hidden)

  const change = stage.change
  if (change === null) {
    gates.push(gate('validate', false, 'no change to validate'))
  } else {
    const activePath = join(destination, 'openspec', 'changes', change)
    const archivedPath =
      stage.archivedAs === null
        ? null
        : join(destination, 'openspec', 'changes', 'archive', stage.archivedAs)
    const restore =
      !existsSync(activePath) && archivedPath !== null && existsSync(archivedPath)
        ? () => renameSync(activePath, archivedPath)
        : null
    if (restore !== null) renameSync(archivedPath, activePath)
    let validate
    try {
      validate = execute(openspecBin, ['validate', change, '--strict'], {
        cwd: destination,
        timeoutMs,
        env: { OPENSPEC_TELEMETRY: '0', OPENSPEC_NO_UPDATE_CHECK: '1' },
      })
    } finally {
      restore?.()
    }
    gates.push(
      gate(
        'validate',
        validate.status === 0 && validate.error === null,
        validate.error ?? `exit ${validate.status}`,
        writeLog(outDir, 'validate.log', `openspec validate ${change} --strict`, validate),
      ),
    )
  }

  return {
    passed: gates.every((entry) => entry.passed),
    gates,
    stage,
    change,
  }
}
