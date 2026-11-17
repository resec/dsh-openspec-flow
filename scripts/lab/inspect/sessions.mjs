/**
 * Session-log inspection for the lab.
 *
 * DSH writes one zstd-compressed JSONL file per session; Node 24 exposes
 * synchronous zstd decompression, so the lab needs no extra tool.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { zstdDecompressSync } from 'node:zlib'

/**
 * Find the stored log for one session id.
 * @param home - DSH home.
 * @param sessionId - session id.
 * @returns the log path, or undefined.
 */
export function findSessionLog(home, sessionId) {
  const sessions = join(home, 'sessions')
  if (!existsSync(sessions)) return undefined
  for (const project of readdirSync(sessions)) {
    const directory = join(sessions, project, sessionId)
    try {
      if (!statSync(directory).isDirectory()) continue
    } catch {
      continue
    }
    for (const file of readdirSync(directory)) {
      if (file.endsWith('.jsonl.zstd')) return join(directory, file)
    }
  }
  return undefined
}

/**
 * Read and parse one session log.
 * @param path - compressed JSONL path.
 * @returns parsed events.
 */
export function readSessionEvents(path) {
  const text = zstdDecompressSync(readFileSync(path)).toString('utf8')
  const events = []
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    try {
      const value = JSON.parse(line)
      if (value !== null && typeof value === 'object') events.push(value)
    } catch {
      // A partially written trailing line is not an event.
    }
  }
  return events
}

/**
 * Count events by type.
 * @param events - parsed events.
 * @returns a type-to-count map.
 */
export function countEvents(events) {
  const counts = {}
  for (const event of events) counts[event.type] = (counts[event.type] ?? 0) + 1
  return counts
}

/**
 * Find events of one type.
 * @param events - parsed events.
 * @param type - event type.
 * @returns matching events.
 */
export function eventsOfType(events, type) {
  return events.filter((event) => event.type === type)
}
