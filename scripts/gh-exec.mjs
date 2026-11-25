#!/usr/bin/env node
/**
 * Bounded command execution for GitHub reads and writes.
 *
 * Every `gh` invocation runs under a deadline. Reads retry under the shared
 * policy, writes stay single-shot, and the reachability probe and the base
 * fetch get their own shorter or longer bounds. The deadline and the retry
 * parameters have documented defaults and environment overrides; a value
 * outside its documented range is ignored so a stray environment cannot
 * weaken the bound.
 */

import { spawnSync } from 'node:child_process'

import { withGhRetry } from './gh-retry.mjs'

/** Default deadline for one `gh` invocation. */
export const DEFAULT_TIMEOUT_MS = 20_000
/** Default stdout and stderr buffer for one invocation. */
export const DEFAULT_MAX_BUFFER_BYTES = 32 * 1024 * 1024
/** Default total attempts for one read. */
export const DEFAULT_READ_ATTEMPTS = 3
/** Default backoff between read attempts. */
export const DEFAULT_BACKOFF_MS = [1_000, 3_000]
/** Default deadline for the single-shot head poll after an update. */
export const DEFAULT_POLL_TIMEOUT_MS = 5_000
/** Default deadline for one reachability probe. */
export const DEFAULT_PROBE_TIMEOUT_MS = 5_000
/** Default attempts for one reachability probe. */
export const DEFAULT_PROBE_ATTEMPTS = 2
/** Default deadline for the base-branch fetch. */
export const DEFAULT_FETCH_TIMEOUT_MS = 30_000
/** Documented deadline range in milliseconds. */
export const TIMEOUT_RANGE_MS = [1_000, 300_000]
/** Documented attempt range. */
export const ATTEMPTS_RANGE = [1, 5]
/** Documented backoff-delay range in milliseconds. */
export const BACKOFF_RANGE_MS = [0, 30_000]

/** A command killed by its deadline; the retry boundary treats it as transient. */
export class GhDeadlineError extends Error {
  /**
   * @param command - the executable.
   * @param args - its arguments.
   * @param deadlineMs - the deadline that killed it.
   */
  constructor(command, args, deadlineMs) {
    super(`${command} ${args.join(' ')} timed out after ${deadlineMs} ms (ETIMEDOUT)`)
    this.name = 'GhDeadlineError'
    this.command = command
    this.args = [...args]
    this.deadlineMs = deadlineMs
  }
}

/** A `gh` invocation that exited non-zero. */
export class GhCommandError extends Error {
  /**
   * @param args - the `gh` arguments.
   * @param detail - stderr or stdout text.
   */
  constructor(args, detail) {
    super(`gh ${args.join(' ')} failed${detail === '' ? '' : `: ${detail}`}`)
    this.name = 'GhCommandError'
    this.args = [...args]
  }
}

/** Process-wide counters for the telemetry line. */
const COUNTERS = { calls: 0, transientFailures: 0 }

/** Read the counters accumulated by this process. */
export function ghCounters() {
  return COUNTERS
}

/** Reset the counters; used by the telemetry wrapper before a command runs. */
export function resetGhCounters() {
  COUNTERS.calls = 0
  COUNTERS.transientFailures = 0
}

/**
 * Read one integer environment override inside its documented range.
 * @param env - the environment.
 * @param name - the variable name.
 * @param fallback - the documented default.
 * @param range - the documented `[minimum, maximum]`.
 * @returns the override or the default.
 */
function readInteger(env, name, fallback, range) {
  const raw = env?.[name]
  if (raw === undefined || String(raw).trim() === '') return fallback
  const text = String(raw).trim()
  if (!/^\d+$/u.test(text)) return fallback
  const value = Number(text)
  return value >= range[0] && value <= range[1] ? value : fallback
}

/**
 * Read a comma-separated backoff override, each delay inside its range.
 * @param env - the environment.
 * @param name - the variable name.
 * @param fallback - the documented default delays.
 * @returns the override or a copy of the default.
 */
function readDelays(env, name, fallback) {
  const raw = env?.[name]
  if (raw === undefined || String(raw).trim() === '') return [...fallback]
  const parts = String(raw).split(',').map((part) => part.trim())
  if (parts.some((part) => !/^\d+$/u.test(part))) return [...fallback]
  const values = parts.map(Number)
  const inRange = values.every((value) => value >= BACKOFF_RANGE_MS[0] && value <= BACKOFF_RANGE_MS[1])
  return inRange ? values : [...fallback]
}

/**
 * Resolve every documented parameter from the environment.
 * @param env - the environment to read; defaults to `process.env`.
 * @returns the resolved parameters.
 */
export function resolveGhConfig(env = process.env) {
  return {
    timeoutMs: readInteger(env, 'PR_REVIEW_GH_TIMEOUT_MS', DEFAULT_TIMEOUT_MS, TIMEOUT_RANGE_MS),
    attempts: readInteger(env, 'PR_REVIEW_GH_ATTEMPTS', DEFAULT_READ_ATTEMPTS, ATTEMPTS_RANGE),
    backoffMs: readDelays(env, 'PR_REVIEW_GH_BACKOFF_MS', DEFAULT_BACKOFF_MS),
    pollTimeoutMs: readInteger(env, 'PR_REVIEW_GH_POLL_TIMEOUT_MS', DEFAULT_POLL_TIMEOUT_MS, TIMEOUT_RANGE_MS),
    probeTimeoutMs: readInteger(env, 'PR_REVIEW_GH_PROBE_TIMEOUT_MS', DEFAULT_PROBE_TIMEOUT_MS, TIMEOUT_RANGE_MS),
    fetchTimeoutMs: readInteger(env, 'PR_REVIEW_GH_FETCH_TIMEOUT_MS', DEFAULT_FETCH_TIMEOUT_MS, TIMEOUT_RANGE_MS),
  }
}

/**
 * Run one command under a deadline, returning its captured result.
 * @param command - the executable.
 * @param args - its arguments.
 * @param options - working directory, deadline, buffer, spawn function and
 *                  whether to count the call as a GitHub call.
 * @returns the spawnSync result.
 */
export function spawnCommand(command, args, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxBuffer = options.maxBufferBytes ?? DEFAULT_MAX_BUFFER_BYTES
  const spawn = options.spawn ?? spawnSync
  if (options.github === true) COUNTERS.calls += 1
  const result = spawn(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: timeoutMs,
    maxBuffer,
  })
  const deadline = result?.error?.code === 'ETIMEDOUT'
    || (result?.status === null && result?.signal !== null && result?.signal !== undefined)
  if (deadline) {
    COUNTERS.transientFailures += 1
    throw new GhDeadlineError(command, args, timeoutMs)
  }
  if (result?.error) throw result.error
  return result
}

/**
 * Run one `gh` invocation under the read deadline.
 * @param args - `gh` arguments.
 * @param options - working directory, deadline, buffer and spawn function.
 * @returns the spawnSync result.
 */
export function spawnGh(args, options = {}) {
  const config = options.config ?? resolveGhConfig(options.env)
  return spawnCommand('gh', args, {
    cwd: options.cwd,
    timeoutMs: options.timeoutMs ?? config.timeoutMs,
    maxBufferBytes: options.maxBufferBytes ?? DEFAULT_MAX_BUFFER_BYTES,
    spawn: options.spawn,
    github: true,
  })
}

/**
 * Throw the standard failure for a non-zero `gh` exit.
 * @param args - `gh` arguments.
 * @param result - the spawnSync result.
 * @returns never.
 */
function throwGhFailure(args, result) {
  const detail = String(result.stderr ?? '').trim() || String(result.stdout ?? '').trim()
  throw new GhCommandError(args, detail)
}

/**
 * Whether `allowFailure` hides this error: a command exit, a deadline kill or a
 * missing binary. A spawn-level failure such as EACCES keeps propagating.
 * @param error - the thrown value.
 * @returns whether the caller may receive undefined instead.
 */
function isAllowedFailure(error) {
  return error instanceof GhCommandError || error instanceof GhDeadlineError || error?.code === 'ENOENT'
}

/**
 * Run one `gh` invocation and return its trimmed stdout.
 * @param args - `gh` arguments.
 * @param options - working directory, deadline, buffer and spawn function.
 * @returns trimmed stdout.
 */
function runOnce(args, options = {}) {
  const result = spawnGh(args, options)
  if (result.status !== 0) throwGhFailure(args, result)
  return String(result.stdout ?? '').trim()
}

/**
 * Run a read under the shared retry policy.
 * @param args - `gh` arguments.
 * @param options - working directory, attempts, delays, deadline, sleep,
 *                  `allowFailure` and the spawn function.
 * @returns trimmed stdout, or undefined when a failure is allowed.
 */
export function ghRead(args, options = {}) {
  const config = options.config ?? resolveGhConfig(options.env)
  const attempts = options.attempts ?? config.attempts
  const delays = options.delays ?? config.backoffMs
  const timeoutMs = options.timeoutMs ?? config.timeoutMs
  try {
    return withGhRetry(
      () => runOnce(args, { ...options, timeoutMs }),
      { attempts, delays, sleep: options.sleep },
    )
  } catch (error) {
    if (options.allowFailure === true && isAllowedFailure(error)) return undefined
    throw error
  }
}

/**
 * Run a write once; the deadline still bounds it.
 * @param args - `gh` arguments.
 * @param options - working directory, deadline, `allowFailure` and the spawn
 *                  function.
 * @returns trimmed stdout, or undefined when a failure is allowed.
 */
export function ghWrite(args, options = {}) {
  const config = options.config ?? resolveGhConfig(options.env)
  try {
    return runOnce(args, { ...options, timeoutMs: options.timeoutMs ?? config.timeoutMs })
  } catch (error) {
    if (options.allowFailure === true && isAllowedFailure(error)) return undefined
    throw error
  }
}

/**
 * Run the single-shot head poll after an update under the poll deadline.
 * @param args - `gh` arguments.
 * @param options - working directory, deadline and the spawn function.
 * @returns trimmed stdout.
 */
export function ghPoll(args, options = {}) {
  const config = options.config ?? resolveGhConfig(options.env)
  return runOnce(args, { ...options, timeoutMs: options.timeoutMs ?? config.pollTimeoutMs })
}

/**
 * Probe reachability under the probe deadline and attempt count.
 * @param args - `gh` arguments.
 * @param options - working directory, attempts, deadline, sleep and spawn.
 * @returns trimmed stdout.
 */
export function ghProbe(args, options = {}) {
  const config = options.config ?? resolveGhConfig(options.env)
  return withGhRetry(
    () => runOnce(args, { ...options, timeoutMs: options.probeTimeoutMs ?? config.probeTimeoutMs }),
    {
      attempts: options.attempts ?? DEFAULT_PROBE_ATTEMPTS,
      delays: options.delays ?? [0],
      sleep: options.sleep,
    },
  )
}

/**
 * Fetch the base branch under the fetch deadline.
 * @param root - repository root.
 * @param options - deadline and spawn function.
 * @returns whether the fetch succeeded.
 */
export function fetchBase(root, options = {}) {
  const config = options.config ?? resolveGhConfig(options.env)
  try {
    const result = spawnCommand('git', ['-C', root, 'fetch', 'origin', 'main'], {
      timeoutMs: options.timeoutMs ?? config.fetchTimeoutMs,
      spawn: options.spawn,
    })
    return result.status === 0
  } catch {
    return false
  }
}
