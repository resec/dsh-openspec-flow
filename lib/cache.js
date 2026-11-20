/**
 * Process-local cache of the last `instructions apply` payload per project,
 * change and store. The session log is the authority; this is a derived cache
 * that only avoids re-reading a payload the model already fetched.
 *
 * @module dsh-openspec-flow/cache
 */

/** Most changes kept warm in one process. */
const MAX_ENTRIES = 16

/** @type {Map<string, object>} */
const entries = new Map()

/**
 * Build the cache key.
 * @param cwd - session working directory.
 * @param change - change name.
 * @param store - optional store id.
 * @returns a stable key.
 */
export function cacheKey(cwd, change, store) {
  return `${cwd}\u0000${change}\u0000${store ?? ''}`
}

/**
 * Read and touch an entry (LRU).
 * @param key - cache key.
 * @returns the entry, or undefined.
 */
export function readCache(key) {
  const entry = entries.get(key)
  if (entry === undefined) return undefined
  entries.delete(key)
  entries.set(key, entry)
  return entry
}

/**
 * Insert or replace an entry.
 * @param key - cache key.
 * @param entry - cached entry.
 * @returns the entry.
 */
export function writeCache(key, entry) {
  entries.delete(key)
  entries.set(key, entry)
  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value
    if (oldest === undefined) break
    entries.delete(oldest)
  }
  return entry
}

/**
 * Drop one entry.
 * @param key - cache key.
 * @returns nothing.
 */
export function removeCache(key) {
  entries.delete(key)
}

/**
 * Drop every entry; used by tests.
 * @returns nothing.
 */
export function clearCache() {
  entries.clear()
}
