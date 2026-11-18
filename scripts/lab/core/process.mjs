/**
 * Bounded child-process helpers for the lab.
 *
 * The lab never leaves a process behind: every long-running process is
 * started with a log file and stopped by the caller in a `finally` block.
 */

import { spawn, spawnSync } from 'node:child_process'
import { createWriteStream, existsSync, readFileSync } from 'node:fs'

/** Characters retained when a command output is summarized. */
export const OUTPUT_SUMMARY_LIMIT = 1_500

/** Marker that shows where the middle of a summarized output was omitted. */
export const OUTPUT_SUMMARY_MARKER = '\n...\n'

/** Share of the budget taken from the head of the output, in tenths. */
const OUTPUT_HEAD_TENTHS = 6

/**
 * Bound a command output while keeping its head and its tail.
 *
 * Leading and trailing whitespace is dropped first, so the retained head starts
 * at content and the retained tail does not end in blank lines. The head names
 * the failing step and the tail carries the last stack frames, so a summarized
 * failure keeps its cause instead of starting mid-word. The split always leaves
 * at least one character for the tail: a zero-length tail would reach the
 * output through `slice(-0)`, which is `slice(0)` and returns everything.
 * A non-string input summarizes to an empty string, because an absent stream
 * must not replace the real failure with a type error.
 *
 * @param text - raw command output.
 * @returns the trimmed output, or its head, the marker and its tail.
 */
export function summarizeOutput(text) {
  const value = typeof text === 'string' ? text.trim() : ''
  if (value.length <= OUTPUT_SUMMARY_LIMIT) return value
  const head = Math.min(Math.ceil((OUTPUT_SUMMARY_LIMIT * OUTPUT_HEAD_TENTHS) / 10), OUTPUT_SUMMARY_LIMIT - 1)
  return `${value.slice(0, head)}${OUTPUT_SUMMARY_MARKER}${value.slice(-(OUTPUT_SUMMARY_LIMIT - head))}`
}

/**
 * Build the failure message for a profile that would not initialize.
 *
 * @param profile - profile name.
 * @param output - captured command output.
 * @param logPath - file that keeps the untouched output.
 * @returns the failure message.
 */
export function profileInitFailure(profile, output, logPath) {
  const summary = summarizeOutput(output)
  if (logPath === undefined) return `could not initialize ${profile}: ${summary}`
  return `could not initialize ${profile}: ${summary} (full output: ${logPath})`
}

/**
 * Run a command to completion.
 * @param command - executable.
 * @param args - arguments.
 * @param options - spawn options; `timeoutMs` is required for bounded use.
 * @returns `{ status, stdout, stderr, signal }`.
 */
export function run(command, args, options = {}) {
  const { timeoutMs = 120_000, ...rest } = options
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 16 * 1024 * 1024,
    ...rest,
  })
  if (result.error) {
    const error = new Error(`${command} failed to start: ${result.error.message}`)
    error.cause = result.error
    throw error
  }
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    signal: result.signal,
  }
}

/**
 * Start a long-running command and append its output to one log file.
 * @param command - executable.
 * @param args - arguments.
 * @param options - cwd, env and the log path.
 * @returns a handle with the child, log path, stop and waitFor.
 */
export function startLogged(command, args, options) {
  const stream = createWriteStream(options.logPath, { flags: 'a' })
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.pipe(stream)
  child.stderr.pipe(stream)
  let stopped = false
  const exited = new Promise((resolve) => {
    child.once('exit', (code, signal) => {
      stream.end()
      resolve({ code, signal })
    })
  })
  return {
    child,
    logPath: options.logPath,
    exited,
    /**
     * Stop the process with SIGTERM, then SIGKILL after a grace period.
     * @returns the exit result.
     */
    async stop() {
      if (child.exitCode !== null || stopped) return await exited
      stopped = true
      child.kill('SIGTERM')
      const timer = setTimeout(() => child.kill('SIGKILL'), 5_000)
      timer.unref()
      const result = await exited
      clearTimeout(timer)
      return result
    },
    /**
     * Wait for a line matching a pattern in the log.
     * @param pattern - regular expression.
     * @param timeoutMs - maximum wait.
     * @returns the matching line.
     */
    async waitFor(pattern, timeoutMs = 60_000) {
      const deadline = Date.now() + timeoutMs
      for (;;) {
        if (existsSync(options.logPath)) {
          const text = readFileSync(options.logPath, 'utf8')
          const line = text.split('\n').find((entry) => pattern.test(entry))
          if (line !== undefined) return line
        }
        if (child.exitCode !== null) {
          throw new Error(`process exited before matching ${pattern}: ${readTail(options.logPath)}`)
        }
        if (Date.now() > deadline) {
          throw new Error(`timed out waiting for ${pattern}: ${readTail(options.logPath)}`)
        }
        await sleep(100)
      }
    },
  }
}

/**
 * Read the tail of a log for an error message.
 * @param path - log path.
 * @returns the last lines.
 */
export function readTail(path) {
  try {
    return readFileSync(path, 'utf8').slice(-4_000)
  } catch {
    return ''
  }
}

/**
 * Sleep without a busy loop.
 * @param ms - milliseconds.
 * @returns a promise.
 */
export function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
