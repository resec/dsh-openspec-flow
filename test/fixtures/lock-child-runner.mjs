/**
 * Parent-side helper for the cross-process worktree lock tests.
 *
 * Starts `lock-child.mjs` and splits its lifecycle into `ready` (the child
 * holds what it acquired) and `done` (the child exited cleanly). The caller
 * owns `options.releaseFile`, so it decides when the overlap ends.
 */

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const CHILD = fileURLToPath(new URL('./lock-child.mjs', import.meta.url))

/**
 * Start one child command.
 * @param command - `acquire-change` or `create-worktree`.
 * @param options - json options forwarded to the child.
 * @returns `{child, ready, done}`.
 */
export function startLockChild(command, options) {
  const child = spawn(process.execPath, [CHILD, command, JSON.stringify(options)], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  let resolved = false
  const ready = new Promise((resolve, reject) => {
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => {
      stdout += chunk
      const line = stdout.split('\n')[0]
      if (resolved || line === '') return
      resolved = true
      resolve(JSON.parse(line))
    })
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk) => {
      stderr += chunk
    })
    child.on('exit', (code) => {
      if (resolved) return
      reject(new Error(`child exited ${String(code)} before its first line: ${stderr.trim()}`))
    })
  })
  const done = new Promise((resolve, reject) => {
    child.on('exit', (code) => {
      if (code === 0) resolve({ stdout, stderr })
      else reject(new Error(`child exited ${String(code)}: ${stderr.trim()}`))
    })
    child.on('error', reject)
  })
  // A test that fails early may never await these; keep that from surfacing as
  // an unhandled rejection without hiding the rejection from a real await.
  ready.catch(() => {})
  done.catch(() => {})
  return { child, ready, done }
}
