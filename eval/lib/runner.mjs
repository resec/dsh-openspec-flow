/**
 * Spawn one headless round and capture its JSON event stream.
 *
 * Each round is a separate process. The first round starts a session; later
 * rounds adopt it with `--session-id`. The runner never interprets the model
 * output beyond the `session`, `error` and `final` events.
 *
 * @module eval/lib/runner
 */

import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DSH_BIN, PROFILE } from './paths.mjs'

/**
 * Build the argument vector for one headless round.
 * @param options - patches, session id, permission and approval policy.
 * @returns the argument vector.
 */
export function roundArgs({ patches = [], sessionId = null, permissionMode, approvalPolicy }) {
  const args = ['--profile', PROFILE]
  for (const patch of patches) args.push('--patch', patch)
  if (sessionId !== null) args.push('--session-id', sessionId)
  args.push('--permission-mode', permissionMode, '--approval-policy', approvalPolicy, '--json', '-')
  return args
}

function parseEvents(text) {
  const events = []
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    try {
      events.push(JSON.parse(line))
    } catch {
      events.push({ type: 'unparsed', line })
    }
  }
  return events
}

/**
 * Run one round.
 * @param options - cwd, task, patches, session id, timeout, output directory and env.
 * @returns the round result.
 */
export function runRound({
  cwd,
  task,
  patches = [],
  sessionId = null,
  permissionMode = 'workspace-write',
  approvalPolicy = 'never',
  timeoutMs = 45 * 60 * 1000,
  outDir,
  index = 0,
  env = {},
  dshBin = DSH_BIN,
  killGraceMs = 5000,
}) {
  mkdirSync(outDir, { recursive: true })
  const stdoutPath = join(outDir, `round-${index}.jsonl`)
  const stderrPath = join(outDir, `round-${index}.stderr.log`)
  const args = roundArgs({ patches, sessionId, permissionMode, approvalPolicy })
  const startedAt = Date.now()

  return new Promise((resolve) => {
    let stdout = ''
    let stderr = ''
    let timedOut = false
    let settled = false
    let killTimer = null
    const child = spawn(dshBin, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const finish = (result) => {
      if (settled) return
      settled = true
      if (killTimer !== null) clearTimeout(killTimer)
      clearTimeout(timer)
      writeFileSync(stdoutPath, stdout)
      writeFileSync(stderrPath, stderr)
      resolve({
        index,
        args,
        stdoutPath,
        stderrPath,
        stdout,
        stderr,
        durationMs: Date.now() - startedAt,
        timedOut,
        ...result,
      })
    }

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
      killTimer = setTimeout(() => child.kill('SIGKILL'), killGraceMs)
    }, timeoutMs)

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', (error) => {
      finish({ exitCode: null, signal: null, events: [], sessionId: null, final: null, error: error.message })
    })
    child.on('close', (exitCode, signal) => {
      const events = parseEvents(stdout)
      const session = events.find((event) => event.type === 'session')
      const final = events.find((event) => event.type === 'final') ?? null
      const error = events.find((event) => event.type === 'error') ?? null
      finish({
        exitCode,
        signal,
        events,
        sessionId: session?.sessionId ?? null,
        final,
        error: error?.message ?? null,
      })
    })

    child.stdin.on('error', () => {})
    child.stdin.end(task, 'utf8')
  })
}
