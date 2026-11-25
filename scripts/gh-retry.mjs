#!/usr/bin/env node
/**
 * Shared retry boundary for GitHub reads.
 *
 * A list or detail read that meets a transient gateway failure is retried once
 * so a scheduled run survives a GitHub-side 502/504. Only read call sites use
 * this helper: a write keeps single-shot semantics, because replaying one can
 * duplicate a published comment or resend an update-branch request whose head
 * has already moved.
 */

/** Block synchronously for the given number of milliseconds. */
export function sleepSync(milliseconds) {
  if (milliseconds > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds)
}

/** The message shapes the retry boundary treats as transient. */
const TRANSIENT_MESSAGES = [
  /bad gateway/iu,
  /gateway time-?out/iu,
  /service unavailable/iu,
  /econnreset/iu,
  /etimedout/iu,
  /socket hang up/iu,
  /timed out/iu,
]

/**
 * Whether a failure is a transient GitHub gateway error.
 * @param error - the thrown value or message.
 * @returns whether one retry is allowed.
 */
export function isTransientGhFailure(error) {
  const message = error instanceof Error ? error.message : String(error ?? '')
  if (/HTTP 5\d\d/u.test(message)) return true
  return TRANSIENT_MESSAGES.some((pattern) => pattern.test(message))
}

/**
 * Run one read call under the retry policy. A transient failure is retried
 * until the attempt budget is spent; a failure that is not transient is
 * rethrown at once.
 * @param run - the call to run.
 * @param options - total attempts, the delays between them, a single delay
 *                  fallback, and the sleep function.
 * @returns the call's return value.
 */
export function withGhRetry(run, { attempts = 2, delays, delayMs = 2000, sleep = sleepSync } = {}) {
  const total = Number.isInteger(attempts) && attempts >= 1 ? attempts : 2
  const schedule = Array.isArray(delays) && delays.length > 0 ? delays : [delayMs]
  let lastError
  for (let attempt = 1; attempt <= total; attempt += 1) {
    try {
      return run()
    } catch (error) {
      lastError = error
      if (attempt === total || !isTransientGhFailure(error)) throw error
      const delay = schedule[Math.min(attempt - 1, schedule.length - 1)]
      if (delay > 0) sleep(delay)
    }
  }
  throw lastError
}
