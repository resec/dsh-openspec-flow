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

/**
 * Whole field names that hold a credential.
 *
 * Any `*_token` and `*_secret` name counts, as do the header and key spellings
 * below. A bare `*_key` suffix does not: the persisted instance environment
 * carries the mock fixture key `LAB_MOCK_KEY`, whose value `lab exec` still
 * needs, and a suffix rule cannot tell that constant from a signing key.
 */
const SECRET_NAME = /^(?:authorization|(?:[A-Za-z][A-Za-z0-9]*_)*(?:token|secret)|password|cookie|api[_-]?key|apikey|(?:access|private|secret|signing)_key)$/iu

/** Query parameters that carry a one-time credential under a plain name. */
const QUERY_NAME = /^(?:code|key)$/iu

/** A scheme word that introduces a credential rather than being one. */
const SCHEME = /^(?:bearer|basic)$/iu

/** A `?name=value` pair in a URL. */
const QUERY_PAIR = /([?&])([A-Za-z][A-Za-z0-9_.-]*)=([^&\s"'`]+)/gu

/** A `Bearer`/`Basic` credential, with or without its `Authorization` header. */
const SECRET_AUTH = /\b((?:authorization\s*[:=]\s*)?(?:bearer|basic)\s+|[A-Za-z-]*authorization\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;"']+)/giu

/** A `Cookie`/`Set-Cookie` header, whose value runs to the end of the line. */
const SECRET_HEADER = /((?:set-)?cookie\s*[:=]\s*)[^\n"']+/giu

/** A `name: value` or `name=value` field, quoted or bare. */
const FIELD_PAIR = /(['"]?)([A-Za-z][A-Za-z0-9_-]*)(['"]?)(\s*[:=]\s*)("[^"\n]*"|'[^'\n]*'|[^\s,;&]+)/gu

/** Tell a credential-bearing name apart from an ordinary one. */
function isSecretName(name) {
  return SECRET_NAME.test(name) || QUERY_NAME.test(name)
}

/**
 * Replace one field value, keeping the quoting and skipping what is already
 * redacted or a scheme word.
 * @param raw - the value as written.
 * @returns the replacement.
 */
function redactFieldValue(raw) {
  const quote = raw[0] === '"' || raw[0] === "'" ? raw[0] : ''
  const bare = quote === '' ? raw : raw.slice(1, -1)
  if (bare === REDACTED || SCHEME.test(bare)) return raw
  return `${quote}${REDACTED}${quote}`
}

/**
 * Replace credential values in one text.
 *
 * Serialized errors carry credentials in the JSON form `{"api_key":"..."}` and
 * in header form `Authorization: Bearer ...`, so the field walk reads quoted
 * names and values rather than only bare `name=value` tokens.
 *
 * @param value - text to clean.
 * @returns the cleaned text.
 */
export function redactText(value) {
  if (typeof value !== 'string' || value === '') return value
  return value
    .replace(QUERY_PAIR, (match, separator, name) => (isSecretName(name) ? `${separator}${name}=${REDACTED}` : match))
    .replace(SECRET_AUTH, (_match, prefix) => `${prefix}${REDACTED}`)
    .replace(SECRET_HEADER, `$1${REDACTED}`)
    .replace(FIELD_PAIR, (match, leading, name, trailing, separator, raw) => (
      SECRET_NAME.test(name)
        ? `${leading}${name}${trailing}${separator}${redactFieldValue(raw)}`
        : match
    ))
}

/**
 * Redact one optional message field.
 *
 * Reports carry the same text from errors and from thrown values, so every
 * field goes through here rather than through a bare `String`.
 *
 * @param value - message, error or undefined.
 * @returns the cleaned message, or undefined when there is none.
 */
export function redactMessage(value) {
  if (value === undefined || value === null) return undefined
  return redactText(value instanceof Error ? value.message : String(value))
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
