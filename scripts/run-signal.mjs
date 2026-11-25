#!/usr/bin/env node
/**
 * Process-group control for the test entrypoints.
 *
 * A run's temporary root is passed to the test process as `TMPDIR`, and the
 * runner's descendants keep that value after the runner exits. Removing the
 * root is therefore only durable once every process in the run's group is
 * gone: a surviving descendant that calls `mkdirSync(..., { recursive: true })`
 * recreates the removed path. POSIX starts the runner as a new process-group
 * leader so a single signal reaches the whole tree; a platform without process
 * groups keeps the direct-child behaviour.
 */

import { spawn } from 'node:child_process'

const POSIX = process.platform !== 'win32'

/** Delay between two checks for a removed process group. */
const STOP_POLL_MS = 10

/** Longest wait for a killed process group to disappear. */
const STOP_BOUND_MS = 250

/**
 * Start a runner as the leader of its own process group on POSIX.
 *
 * @param command - executable to start.
 * @param args - arguments for the executable.
 * @param options - spawn options, forwarded unchanged.
 * @returns the child process.
 */
export function spawnRunChild(command, args, options = {}) {
  return spawn(command, args, POSIX ? { ...options, detached: true } : options)
}

/**
 * Send a signal to the run's process group, or to the child where the platform
 * has no process groups.
 *
 * @param child - the runner started by {@link spawnRunChild}.
 * @param signal - signal name or number.
 * @returns false when the group is already gone, otherwise the signal result.
 */
export function signalRunChild(child, signal) {
  if (!POSIX) return child.kill(signal)
  try {
    return process.kill(-child.pid, signal)
  } catch (error) {
    if (error.code === 'ESRCH') return false
    return child.kill(signal)
  }
}

/**
 * Kill every process in the run's group and wait for the group to disappear.
 *
 * The wait is bounded so an unreaped process cannot hold the entrypoint. A
 * group that is already gone is not an error.
 *
 * @param child - the runner started by {@link spawnRunChild}, or undefined.
 * @returns a promise that settles once the group is gone or the bound expires.
 */
export async function stopRunChild(child) {
  if (child === undefined || child.pid === undefined) return
  if (!POSIX) {
    try {
      child.kill('SIGKILL')
    } catch {
      // The child is already gone; nothing is left to stop.
    }
    return
  }
  try {
    process.kill(-child.pid, 'SIGKILL')
  } catch (error) {
    if (error.code === 'ESRCH') return
    throw error
  }
  const deadline = Date.now() + STOP_BOUND_MS
  for (;;) {
    try {
      process.kill(-child.pid, 0)
    } catch (error) {
      if (error.code === 'ESRCH') return
      throw error
    }
    if (Date.now() >= deadline) return
    await new Promise((resolve) => setTimeout(resolve, STOP_POLL_MS))
  }
}

/**
 * Stop the run's process group, then run the root cleanup.
 *
 * The stop must complete before the root is removed, or a surviving descendant
 * recreates it. `stop` is injectable so the order has a deterministic test.
 *
 * @param child - the runner started by {@link spawnRunChild}, or undefined.
 * @param finish - removes the run root.
 * @param stop - the stop step, defaulting to {@link stopRunChild}.
 * @returns a promise that settles after the cleanup ran.
 */
export async function finishRun(child, finish, stop = stopRunChild) {
  try {
    if (child !== undefined) await stop(child)
  } finally {
    finish()
  }
}
