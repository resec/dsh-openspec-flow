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

/** Delay between two checks for a removed process group. */
const STOP_POLL_MS = 10

/** Longest wait for a killed process group to disappear. */
const STOP_BOUND_MS = 250

/**
 * Report whether a platform provides process groups.
 *
 * `process.platform` is the default so the branch stays testable.
 *
 * @param platform - a `process.platform` value.
 * @returns true when the platform has signalable process groups.
 */
export function usesProcessGroup(platform = process.platform) {
  return platform !== 'win32'
}

/**
 * Build the spawn options that put the runner in its own process group.
 *
 * @param options - spawn options.
 * @param platform - a `process.platform` value.
 * @returns the options to spawn with.
 */
export function runChildSpawnOptions(options = {}, platform = process.platform) {
  return usesProcessGroup(platform) ? { ...options, detached: true } : options
}

/**
 * Start a runner as the leader of its own process group where the platform
 * provides one.
 *
 * @param command - executable to start.
 * @param args - arguments for the executable.
 * @param options - spawn options, forwarded to {@link runChildSpawnOptions}.
 * @param platform - a `process.platform` value.
 * @returns the child process.
 */
export function spawnRunChild(command, args, options = {}, platform = process.platform) {
  return spawn(command, args, runChildSpawnOptions(options, platform))
}

/**
 * Send a signal to the run's process group, or to the child where the platform
 * has no process groups.
 *
 * @param child - the runner started by {@link spawnRunChild}.
 * @param signal - signal name or number.
 * @param platform - a `process.platform` value.
 * @returns false when the group is already gone, otherwise the signal result.
 */
export function signalRunChild(child, signal, platform = process.platform) {
  if (!usesProcessGroup(platform)) return child.kill(signal)
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
 * group that is already gone, and a child that never spawned, are not errors.
 *
 * @param child - the runner started by {@link spawnRunChild}, or undefined.
 * @param platform - a `process.platform` value.
 * @returns a promise that settles once the group is gone or the bound expires.
 */
export async function stopRunChild(child, platform = process.platform) {
  if (child === undefined || child.pid === undefined) return
  if (!usesProcessGroup(platform)) {
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
 * recreates it. The cleanup runs even when the stop fails, so a stop error
 * cannot leave the root behind; `stop` is injectable so the order has a
 * deterministic test.
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
