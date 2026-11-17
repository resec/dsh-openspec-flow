/**
 * Headless driver: one short DSH task with a machine-readable event stream.
 *
 * The child is spawned asynchronously so the lab mock server keeps answering
 * model requests on the same event loop.
 */

import { spawn } from 'node:child_process'

/**
 * Parse NDJSON produced by `dsh --profile <headless> --json`.
 * @param text - stdout.
 * @returns parsed events; malformed lines are skipped.
 */
export function parseHeadlessEvents(text) {
  const events = []
  for (const line of String(text).split('\n')) {
    if (line.trim() === '') continue
    try {
      const value = JSON.parse(line)
      if (value !== null && typeof value === 'object') events.push(value)
    } catch {
      // A projection line can be truncated by the producer; skip it.
    }
  }
  return events
}

/**
 * Extract tool calls from a headless event list.
 * @param events - parsed events.
 * @returns tool call events.
 */
export function toolCalls(events) {
  return events.filter((event) => event.type === 'tool_call')
}

/**
 * Extract tool results from a headless event list.
 * @param events - parsed events.
 * @returns tool result events.
 */
export function toolResults(events) {
  return events.filter((event) => event.type === 'tool_result')
}

/**
 * Run one headless task.
 * @param options - Node, DSH bin, profile, environment, cwd and task.
 * @returns `{ status, events, final, stderr, stdout }`.
 */
export async function runHeadless({
  node = process.execPath,
  dshBin,
  profile,
  env,
  cwd,
  task,
  timeoutMs = 10 * 60_000,
  permissionMode = 'workspace-write',
  approvalPolicy = 'never',
  sessionId,
  extraArgs = [],
}) {
  const args = [dshBin, '--profile', profile, '--json', '--permission-mode', permissionMode, '--approval-policy', approvalPolicy]
  if (sessionId !== undefined) args.push('--session-id', sessionId)
  args.push(...extraArgs, '-')
  const child = spawn(node, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] })
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8')
  child.stderr.setEncoding('utf8')
  child.stdout.on('data', (chunk) => {
    stdout += chunk
  })
  child.stderr.on('data', (chunk) => {
    stderr += chunk
  })
  child.stdin.end(task)
  const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs)
  timer.unref()
  const result = await new Promise((resolve) => {
    child.once('error', (error) => resolve({ code: 1, signal: null, error }))
    child.once('exit', (code, signal) => resolve({ code, signal }))
  })
  clearTimeout(timer)
  const events = parseHeadlessEvents(stdout)
  const final = [...events].reverse().find((event) => event.type === 'final')
  return {
    status: result.code ?? 1,
    stdout,
    stderr,
    events,
    final,
    completed: (result.code ?? 1) === 0 && final?.reason?.kind === 'completed',
    error: final?.reason?.kind === 'error' ? final.reason.error : undefined,
  }
}
