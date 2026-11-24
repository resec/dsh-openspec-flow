/**
 * File watch for an open draft round.
 *
 * The watch is advisory: it compares the draft object hash with the hash the
 * round was bound to and calls back once when they differ. It never writes a
 * report or a finding, and a watch that cannot start is logged rather than
 * failing the review call. The round's `resume` path is the authority.
 *
 * Registries are module-level so both plugin entries in one Host process share
 * them, matching `wakeup.js`. The default watcher is `fs.watch` with the
 * recursive option; tests inject a fake through `setRoundWatchTestHooks`.
 *
 * @module dsh-openspec-flow/review/watch
 */

import { watch as fsWatch } from 'node:fs'
import { draftObject } from './object.js'

/** Armed watches, keyed by review directory and kind. */
const WATCHES = new Map()

/** Test-only watcher factory. */
let watchFactoryOverride

/** Test-only debounce. */
let debounceOverride

/** Default debounce for a burst of filesystem events. */
const DEFAULT_DEBOUNCE_MS = 400

/**
 * Replace the watcher factory and debounce for tests.
 * @param options - optional `watch` factory and `debounceMs`.
 * @returns nothing.
 */
export function setRoundWatchTestHooks(options = {}) {
  watchFactoryOverride = options.watch
  debounceOverride = options.debounceMs
}

/**
 * Restore the production watcher and debounce.
 * @returns nothing.
 */
export function resetRoundWatchTestHooks() {
  watchFactoryOverride = undefined
  debounceOverride = undefined
}

/**
 * Stable registry key for one review kind.
 * @param directory - review directory.
 * @param kind - review kind.
 * @returns the key.
 */
function watchKey(directory, kind = 'draft') {
  return `${directory}\u0000${kind}`
}

/**
 * Stop the watch for one review directory.
 * @param directory - review directory.
 * @param kind - review kind.
 * @returns nothing.
 */
export function disarmRoundWatch(directory, kind = 'draft') {
  const key = watchKey(directory, kind)
  const entry = WATCHES.get(key)
  if (entry === undefined) return
  WATCHES.delete(key)
  entry.stop()
}

/**
 * Stop every armed watch; the plugin entry calls this on unload.
 * @returns nothing.
 */
export function clearRoundWatches() {
  for (const entry of WATCHES.values()) entry.stop()
  WATCHES.clear()
}

/**
 * Watch one change directory for a draft round.
 *
 * The callback fires at most once per arm, with the round, the bound hash and
 * the observed hash. The watch stops itself before the callback runs, so a
 * later edit cannot produce a second notice; a new round arms a new watch.
 *
 * @param options - directory, change root, intent, round, bound hash, onStale,
 *   logger, watch factory and debounce.
 * @returns the armed entry, or undefined when the watch could not start.
 */
export function armRoundWatch(options) {
  const {
    directory, changeRoot, intent, round, hash, onStale, logger,
  } = options
  const kind = options.kind ?? 'draft'
  disarmRoundWatch(directory, kind)
  const debounceMs = options.debounceMs ?? debounceOverride ?? DEFAULT_DEBOUNCE_MS
  const factory = options.watchFactory ?? watchFactoryOverride ?? fsWatch
  let timer
  let fired = false
  let stopped = false

  const stop = () => {
    stopped = true
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
    try {
      watcher?.close?.()
    } catch {
      // A watcher that already closed is not an error.
    }
  }

  const settle = () => {
    timer = undefined
    if (fired || stopped) return
    let next
    try {
      next = draftObject(changeRoot, intent).objectHash
    } catch (error) {
      logger?.warn?.(
        `openspec-flow: the draft watch could not hash the artifacts: ${error instanceof Error ? error.message : String(error)}`,
      )
      return
    }
    if (next === hash) return
    fired = true
    WATCHES.delete(watchKey(directory, kind))
    stop()
    Promise.resolve()
      .then(() => onStale({ round, from: hash, to: next }))
      .catch((error) => {
        logger?.warn?.(
          `openspec-flow: the draft watch notice failed: ${error instanceof Error ? error.message : String(error)}`,
        )
      })
  }

  const listener = () => {
    if (fired || stopped) return
    if (timer !== undefined) clearTimeout(timer)
    timer = setTimeout(settle, debounceMs)
    timer.unref?.()
  }

  let watcher
  try {
    watcher = factory(changeRoot, { recursive: true }, listener)
  } catch (error) {
    logger?.warn?.(
      `openspec-flow: the draft watch could not start: ${error instanceof Error ? error.message : String(error)}`,
    )
    return undefined
  }
  // The watch is advisory: a non-Host process whose only remaining work is the
  // watch must be able to exit before a report, an abandon or an unload.
  watcher?.unref?.()
  watcher?.on?.('error', (error) => {
    logger?.warn?.(
      `openspec-flow: the draft watch stopped: ${error instanceof Error ? error.message : String(error)}`,
    )
    const key = watchKey(directory, kind)
    if (WATCHES.get(key)?.stop === stop) WATCHES.delete(key)
    stop()
  })
  const entry = { stop }
  WATCHES.set(watchKey(directory, kind), entry)
  return { round, close: stop }
}
