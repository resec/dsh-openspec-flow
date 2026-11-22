/**
 * Redaction for lab state, reports and error text.
 *
 * A lab run keeps a web session cookie and a startup URL that carries a
 * one-time token. Neither may reach `report.json` or the printed state, so the
 * credential fields are dropped and any remaining occurrence in error text is
 * replaced with `<redacted>`.
 *
 * @module dsh-openspec-flow/lab/core/redact
 */

/** The replacement written over a credential value. */
export const REDACTED = '<redacted>'

/** Substrings that mark a value as a credential. */
const SECRET_QUERY = /([?&](?:token|access_token|code|key|secret)=)[^&\s"'`]+/giu
const SECRET_HEADER = /((?:set-)?cookie\s*[:=]\s*)[^\n"']+/giu
const SECRET_ASSIGN = /\b(token|access_token|cookie|api[_-]?key|secret)\b(\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;]+)/giu

/**
 * Replace credential values in one text.
 * @param value - text to clean.
 * @returns the cleaned text.
 */
export function redactText(value) {
  if (typeof value !== 'string' || value === '') return value
  return value
    .replace(SECRET_QUERY, `$1${REDACTED}`)
    .replace(SECRET_HEADER, `$1${REDACTED}`)
    .replace(SECRET_ASSIGN, `$1$2${REDACTED}`)
}

/**
 * Tell a data record apart from a live handle.
 *
 * Only plain objects and null-prototype records carry printable state; anything
 * else is a class instance such as a Playwright page or a child process, whose
 * graph is cyclic and must stay out of the state.
 *
 * @param value - value to test.
 * @returns whether the value is a plain record.
 */
function isPlainRecord(value) {
  if (value === null || typeof value !== 'object') return false
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

/**
 * Clean one value, recursing through arrays and plain records.
 *
 * Live handles are dropped, and a value that reappears on the current path is
 * replaced rather than walked again: the state holds references to browser and
 * process objects, so an unguarded walk never terminates.
 *
 * @param value - value to clean.
 * @param seen - objects already on the current path.
 * @returns the cleaned value.
 */
function redactValue(value, seen = new WeakSet()) {
  if (typeof value === 'string') return redactText(value)
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value)) return REDACTED
  seen.add(value)
  try {
    if (Array.isArray(value)) return value.map((entry) => redactValue(entry, seen))
    if (!isPlainRecord(value)) return REDACTED
    const out = {}
    for (const [key, entry] of Object.entries(value)) {
      if (typeof entry === 'function') continue
      if (typeof entry === 'object' && entry !== null && !Array.isArray(entry) && !isPlainRecord(entry)) continue
      out[key] = redactValue(entry, seen)
    }
    return out
  } finally {
    seen.delete(value)
  }
}

/**
 * Build the printable state, without credentials or live handles.
 *
 * The web entry keeps its origin and log path so a failure stays diagnosable.
 * The view is an allowlist rather than a denylist: a session carries a cookie,
 * a URL query and live page, browser and process objects, and wrapping any of
 * them in a plain record must not smuggle them in.
 *
 * @param state - live lab state.
 * @returns a plain, printable copy.
 */
export function redactState(state) {
  if (state === null || typeof state !== 'object') return state
  const out = {}
  for (const [key, value] of Object.entries(state)) {
    if (key === 'web' && value !== null && typeof value === 'object') {
      out.web = redactValue({ base: value.base, logPath: value.logPath })
      continue
    }
    out[key] = redactValue(value)
  }
  return out
}
