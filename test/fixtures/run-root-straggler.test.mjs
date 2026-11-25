import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import test from 'node:test'

/**
 * Test fixture that leaves one descendant behind, holding the run's `TMPDIR`.
 *
 * The descendant waits for the marker in `RUN_ROOT_STRAGGLER_SIGNAL` and then
 * recreates a path under `TMPDIR` with a recursive mkdir — exactly what an
 * orphaned CLI does to a removed run root. The marker only appears after the
 * entrypoint exits, so a run that stopped its process group leaves nobody to
 * hear it, while a run that did not leaves a recreated root.
 *
 * Modes: `exit` returns immediately, `stay` keeps the test process alive so a
 * SIGTERM lands on it. `RUN_ROOT_STRAGGLER_IGNORE=1` makes the descendant ignore
 * SIGTERM, and `RUN_ROOT_STRAGGLER_DEADLINE_MS` bounds the wait.
 */
const MODE = process.env.RUN_ROOT_STRAGGLER_MODE ?? 'exit'
const DEADLINE_MS = process.env.RUN_ROOT_STRAGGLER_DEADLINE_MS ?? '30000'

const STRAGGLER = `
  const { existsSync, mkdirSync } = require('node:fs')
  const { join } = require('node:path')
  if (process.env.RUN_ROOT_STRAGGLER_IGNORE === '1') process.on('SIGTERM', () => {})
  const signalPath = process.env.RUN_ROOT_STRAGGLER_SIGNAL
  const deadline = Date.now() + Number(process.env.RUN_ROOT_STRAGGLER_DEADLINE_MS ?? 30000)
  const timer = setInterval(() => {
    if (signalPath !== undefined && existsSync(signalPath)) {
      clearInterval(timer)
      mkdirSync(join(process.env.TMPDIR, 'late', 'root'), { recursive: true })
      process.exit(0)
    }
    if (Date.now() >= deadline) {
      clearInterval(timer)
      process.exit(0)
    }
  }, 20)
`

test('run root straggler leaves no descendant', async () => {
  const straggler = spawn(process.execPath, ['-e', STRAGGLER], { stdio: 'ignore' })
  if (process.env.RUN_ROOT_STRAGGLER_PID !== undefined) {
    writeFileSync(process.env.RUN_ROOT_STRAGGLER_PID, String(straggler.pid))
  }
  straggler.unref()
  if (MODE === 'stay') await new Promise((resolve) => setTimeout(resolve, 60_000))
})
