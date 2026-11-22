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
 * Clean one value, recursing through arrays and plain objects.
 * @param value - value to clean.
 * @returns the cleaned value.
 */
function redactValue(value) {
  if (typeof value === 'string') return redactText(value)
  if (Array.isArray(value)) return value.map(redactValue)
  if (value === null || typeof value !== 'object') return value
  const out = {}
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'function') continue
    out[key] = redactValue(entry)
  }
  return out
}

/**
 * Build the printable state, without credentials or live handles.
 *
 * The web entry keeps its origin and log path so a failure stays diagnosable;
 * the cookie, the URL query and the child handle are dropped.
 *
 * @param state - live lab state.
 * @returns a plain, printable copy.
 */
export function redactState(state) {
  if (state === null || typeof state !== 'object') return state
  const out = {}
  for (const [key, value] of Object.entries(state)) {
    if (key === 'web' && value !== null && typeof value === 'object') {
      const { cookie, url, process: handle, ...rest } = value
      void cookie
      void url
      void handle
      out.web = redactValue(rest)
      continue
    }
    out[key] = redactValue(value)
  }
  return out
}
