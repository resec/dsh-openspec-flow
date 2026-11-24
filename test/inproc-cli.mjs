/**
 * Run the bundled OpenSpec CLI inside the test process.
 *
 * The review suites spend most of their time starting a Node process per CLI
 * call. This module mirrors the fake context's `subprocess.spawn` contract so
 * a suite can opt into an in-process call: `done`, `collected`, `terminate` and
 * `waitForExit`.
 *
 * Only `console.*` is captured, not `process.stdout.write`: the Node test
 * runner uses the latter for its own child protocol, so leaving it alone keeps
 * the runner's channel intact. The CLI writes its JSON through `console.log`.
 *
 * Calls are serialized: each call changes `process.cwd`, the environment, the
 * captured console and the process exit code, so two runs cannot overlap. A
 * second call waits for the first one to finish and keeps its own output. When
 * the CLI exposes an awaitable program entry, the runner waits for the command
 * action; otherwise it uses the output-based fallback.
 */

import { format } from 'node:util'

const DEFAULT_QUIET_MS = 25
const DEFAULT_NO_OUTPUT_GRACE_MS = 2_000
const DEFAULT_DEADLINE_MS = 30_000
const POLL_MS = 5
const CONSOLE_METHODS = ['log', 'error', 'warn', 'info', 'debug']

/**
 * Await one command promise with the call's deadline, abort signal and handle.
 * @param promise - the CLI's awaitable command.
 * @param options - `deadlineMs`, the call's abort `signal` and its `terminated`
 *   signal.
 * @returns `'done'`, `'deadline'` or `'terminated'`; rejects on abort or a
 *   command error.
 */
async function awaitCommand(promise, { deadlineMs, signal, terminated }) {
  let timer
  let onAbort
  try {
    const timeout = new Promise((resolve) => {
      timer = setTimeout(() => resolve('deadline'), deadlineMs)
    })
    const aborted = new Promise((resolve, reject) => {
      if (signal === undefined) return
      onAbort = () => reject(new Error('the OpenSpec CLI was aborted'))
      if (signal.aborted) onAbort()
      else signal.addEventListener('abort', onAbort, { once: true })
    })
    const completion = Promise.resolve(promise).then(() => 'done')
    completion.catch(() => {})
    return await Promise.race([completion, timeout, aborted, terminated])
  } finally {
    clearTimeout(timer)
    if (signal !== undefined) signal.removeEventListener('abort', onAbort)
  }
}

/**
 * Set or delete one environment variable.
 * @param key - variable name.
 * @param value - value, or undefined to delete.
 * @returns nothing.
 */
function setEnv(key, value) {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

/**
 * Create a spawner that runs CLI calls in this process.
 * @param options - `load` resolves the CLI module; `deadlineMs` bounds both
 *   completion paths, while `quietMs` and `noOutputGraceMs` bound only the
 *   polling fallback. Tests override them to keep the suite fast.
 * @returns the spawner.
 */
export function createInprocSpawner({
  load = () => import('@fission-ai/openspec'),
  quietMs = DEFAULT_QUIET_MS,
  noOutputGraceMs = DEFAULT_NO_OUTPUT_GRACE_MS,
  deadlineMs = DEFAULT_DEADLINE_MS,
} = {}) {
  let tail = Promise.resolve()
  let cliModule
  const loadOnce = () => {
    cliModule ??= load()
    return cliModule
  }
  return {
    /**
     * Run one CLI call and return a spawn-shaped handle.
     * @param spec - `argv`, `cwd`, `env` and `signal`.
     * @returns the handle.
     */
    spawn(spec) {
      let stdout = ''
      let stderr = ''
      let explicitExit
      let assignedExit
      let aborted = false
      let lastActivity = Date.now()
      let resolveDone
      let rejectDone
      const done = new Promise((resolve, reject) => {
        resolveDone = resolve
        rejectDone = reject
      })
      let terminateCall
      const terminated = new Promise((resolve) => {
        terminateCall = () => resolve('terminated')
      })
      let release
      const gate = new Promise((resolve) => {
        release = resolve
      })
      const previous = tail
      tail = previous.then(() => gate)

      const onAbort = () => {
        aborted = true
        rejectDone(new Error('the OpenSpec CLI was aborted'))
      }
      if (spec.signal !== undefined) {
        if (spec.signal.aborted) onAbort()
        else spec.signal.addEventListener('abort', onAbort, { once: true })
      }

      const run = async () => {
        await previous
        if (aborted) {
          release()
          return
        }
        let restore
        try {
          const savedConsole = {}
          for (const method of CONSOLE_METHODS) savedConsole[method] = console[method]
          const savedExit = process.exit
          const savedExitCode = process.exitCode
          const savedCwd = process.cwd()
          const savedEnv = new Map()
          const envKeys = ['CI', 'NO_COLOR', 'FORCE_COLOR', ...Object.keys(spec.env ?? {})]
          for (const key of envKeys) savedEnv.set(key, process.env[key])
          restore = () => {
            for (const method of CONSOLE_METHODS) console[method] = savedConsole[method]
            process.exit = savedExit
            process.exitCode = savedExitCode
            try {
              process.chdir(savedCwd)
            } catch {
              // The original directory is gone; the remaining state still restores.
            }
            for (const [key, value] of savedEnv) setEnv(key, value)
          }
          const capture = (target) => (...args) => {
            target(format(...args) + '\n')
            lastActivity = Date.now()
          }
          console.log = capture((value) => { stdout += value })
          console.error = capture((value) => { stderr += value })
          console.warn = capture((value) => { stderr += value })
          console.info = capture((value) => { stdout += value })
          console.debug = capture((value) => { stderr += value })
          process.exit = (code) => {
            explicitExit = Number.isInteger(code) ? code : 0
            lastActivity = Date.now()
          }
          process.chdir(spec.cwd)
          setEnv('CI', '1')
          setEnv('NO_COLOR', '1')
          setEnv('FORCE_COLOR', '0')
          for (const [key, value] of Object.entries(spec.env ?? {})) setEnv(key, value)
          const module = await loadOnce()
          if (typeof module.program?.parseAsync === 'function') {
            const result = await awaitCommand(module.program.parseAsync(spec.argv), {
              deadlineMs,
              signal: spec.signal,
              terminated,
            })
            if (result === 'terminated') explicitExit = 143
            else if (result === 'deadline' && explicitExit === undefined) explicitExit = 124
            else if (explicitExit === undefined && process.exitCode !== savedExitCode) {
              assignedExit = process.exitCode
            }
          } else {
            module.runCli(spec.argv)
            const startedAt = Date.now()
            let sawOutput = false
            for (;;) {
              await new Promise((resolve) => setTimeout(resolve, POLL_MS))
              if (aborted) return
              if (explicitExit !== undefined) break
              if (process.exitCode !== savedExitCode) {
                assignedExit = process.exitCode
                break
              }
              if (stdout.length > 0 || stderr.length > 0) sawOutput = true
              if (sawOutput && Date.now() - lastActivity >= quietMs) break
              if (!sawOutput && Date.now() - startedAt >= noOutputGraceMs) break
              if (Date.now() - startedAt >= deadlineMs) {
                explicitExit = 124
                break
              }
            }
          }
          resolveDone({ exitCode: explicitExit ?? assignedExit ?? 0, signal: null })
        } catch (error) {
          rejectDone(error)
        } finally {
          if (spec.signal !== undefined) spec.signal.removeEventListener('abort', onAbort)
          try {
            if (restore !== undefined) restore()
          } finally {
            release()
          }
        }
      }
      void run()

      return {
        stdin: undefined,
        stdout: undefined,
        stderr: undefined,
        control: undefined,
        collected: {
          stdout: { readFrom: () => ({ text: stdout, nextOffset: Buffer.byteLength(stdout), lossy: false }) },
          stderr: { readFrom: () => ({ text: stderr, nextOffset: Buffer.byteLength(stderr), lossy: false }) },
        },
        done,
        terminate() {
          explicitExit = 143
          lastActivity = Date.now()
          terminateCall()
        },
        waitForExit() {
          return done.then(() => true)
        },
      }
    },
  }
}
