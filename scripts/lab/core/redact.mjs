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

/** Whole field names that hold a credential without a marked segment. */
const CREDENTIAL_WHOLE = /^(?:cookie|set_cookie|apikey|api_key)$/u

/** A trailing name segment that marks a credential. */
const CREDENTIAL_SEGMENT = /(?:^|_)(?:token|secret|authorization|password|passwd)$/u

/** A `*_key` name; a bare `key` does not count, so a plain dict key stays readable. */
const KEY_SEGMENT = /[a-z0-9]_key$/u

/** Query parameters that carry a one-time credential under a plain name. */
const QUERY_NAME = /^(?:code|key)$/iu

/**
 * The scheme words that introduce an `Authorization` value.
 *
 * A word from this list carries no secret of its own and reads better in a
 * report, so it stays in front of the replacement. The list is closed on
 * purpose: `Digest`, `AWS4-HMAC-SHA256` and `OAuth` values hold several
 * `name=value` parameters, and an unknown word may be part of the credential
 * rather than a scheme.
 */
const SCHEME_WORDS = ['bearer', 'basic', 'token', 'digest', 'negotiate', 'oauth', 'aws4-hmac-sha256']

/** A scheme word standing alone as a value. */
const SCHEME = new RegExp(`^(?:${SCHEME_WORDS.join('|')})$`, 'iu')

/** A scheme word in front of the value it introduces. */
const SCHEME_PREFIX = new RegExp(`^(?:${SCHEME_WORDS.join('|')})\\s+`, 'iu')

/** Sentence punctuation that closes a value rather than belonging to it. */
const SENTENCE_MARK = /[.,;:!?]+$/u

/**
 * Words that name the scheme or the credential instead of carrying one.
 *
 * Position alone cannot separate `Bearer abc` from `Basic auth.`: both are a
 * scheme word followed by one ordinary word that ends the line. The word itself
 * is what tells a header value from prose, so the names that describe the
 * scheme stay readable while the rest of the line is replaced.
 */
const SCHEME_PROSE = new Set([
  'auth', 'authentication', 'authorization', 'token', 'tokens', 'scheme', 'schemes',
  'header', 'headers', 'credential', 'credentials', 'flow', 'mode', 'type',
])

/** A `?name=value` pair in a URL. */
const QUERY_PAIR = /([?&])([A-Za-z][A-Za-z0-9_.-]*)=([^&\s"'`]+)/gu

/**
 * An `Authorization` header, whose value is a credential whatever its shape.
 *
 * The whole value is replaced, because a `Digest`, `AWS4-HMAC-SHA256` or
 * `OAuth` value carries several `name=value` parameters and a single-token
 * rule would keep all but the first. A quoted value is one serialized field, so
 * it is matched whole; an unquoted value runs to the end of the line.
 */
const SECRET_AUTH_HEADER = /\b((?:[A-Za-z-]*authorization)[ \t]*[:=][ \t]*)("[^"\n]*"|'[^'\n]*'|[^\n]+)/giu

/**
 * A scheme word with no header.
 *
 * A value here may be a credential or an ordinary word: `basic initialization
 * failed` is prose, while `Bearer abc` is the header value without its name.
 * {@link redactBareScheme} decides between them.
 */
const SECRET_AUTH_SCHEME = /\b((?:bearer|basic)\s+)("[^"\n]*"|'[^'\n]*'|[^\s,;"']+)/giu

/**
 * A `Cookie`/`Set-Cookie` header, whose value may be quoted.
 *
 * A quoted value is one serialized field and keeps its place; anything after it
 * from the first `;` on belongs to the same header line, because a cookie list
 * can carry several quoted values and stopping at the first would keep the
 * rest.
 */
const SECRET_HEADER = /((?:set-)?cookie[ \t]*[:=][ \t]*)((?:"[^"\n]*"|'[^'\n]*')(?:[ \t]*;[^\n]*)?|[^\n]+)/giu

/** A `name: value` or `name=value` field, quoted or bare. */
const FIELD_PAIR = /(['"]?)([A-Za-z][A-Za-z0-9_-]*)(['"]?)(\s*[:=]\s*)("[^"\n]*"|'[^'\n]*'|[^\s,;&]+)/gu

/**
 * Fold a field name to one spelling.
 *
 * The same credential is written `apiKey` in a settings object, `X-API-Key` in
 * a header and `OPENAI_API_KEY` in an environment dump, so the name is compared
 * in one spelling rather than three.
 *
 * @param name - the name as written.
 * @returns the folded name.
 */
function normalizeName(name) {
  return name
    .replace(/([a-z0-9])([A-Z])/gu, '$1_$2')
    .replace(/-/gu, '_')
    .toLowerCase()
}

/**
 * Tell a credential-bearing field name apart from an ordinary one.
 *
 * The mock fixture key counts as one here: `lab exec` reads it from the
 * instance environment, which is a record, and a record field is copied under
 * its own name by {@link redactValue}. Only text that spells the pair out, such
 * as a check detail echoing the environment, reaches this rule, and there the
 * fixture must be replaced like any other key.
 *
 * @param name - the name as written.
 * @returns whether the field holds a credential.
 */
function isCredentialName(name) {
  const folded = normalizeName(name)
  return CREDENTIAL_WHOLE.test(folded) || CREDENTIAL_SEGMENT.test(folded) || KEY_SEGMENT.test(folded)
}

/** Split a quoted value into its quote and its body. */
function splitQuoted(raw) {
  const quote = raw[0] === '"' || raw[0] === "'" ? raw[0] : ''
  return { quote, bare: quote === '' ? raw : raw.slice(1, -1) }
}

/**
 * Replace one field value, keeping the quoting and skipping what is already
 * redacted or a scheme word.
 * @param raw - the value as written.
 * @returns the replacement.
 */
function redactFieldValue(raw) {
  const { quote, bare } = splitQuoted(raw)
  if (bare === REDACTED || SCHEME.test(bare)) return raw
  return `${quote}${REDACTED}${quote}`
}

/**
 * Replace one `Authorization` value, keeping a quoted form and a scheme word.
 *
 * A quoted value is one serialized field, so the whole field goes. A bare value
 * keeps a known scheme prefix only; any other prefix stays inside the
 * replacement, because a word the list does not name may be the credential.
 *
 * @param raw - the value as written.
 * @returns the replacement, or the value when it is already redacted.
 */
function redactAuthValue(raw) {
  const { quote, bare } = splitQuoted(raw)
  if (bare === '' || bare === REDACTED) return raw
  if (quote !== '') return `${quote}${REDACTED}${quote}`
  const prefix = SCHEME_PREFIX.exec(bare)
  return prefix === null ? REDACTED : `${prefix[0]}${REDACTED}`
}

/**
 * Tell a value that follows a bare scheme word apart from an ordinary word.
 *
 * A token carries a digit, a separator or mixed case; a sentence word such as
 * `initialization` carries none of them, so a prose line keeps its wording.
 *
 * @param raw - the value as written.
 * @returns whether the value looks like a credential.
 */
function looksLikeCredential(raw) {
  const { bare } = splitQuoted(raw)
  if (bare === '' || bare === REDACTED) return false
  if (/[0-9._~+/=-]/u.test(bare)) return true
  if (/[a-z]/u.test(bare) && /[A-Z]/u.test(bare)) return true
  return bare.length >= 32
}

/**
 * Redact one bare scheme value, or keep it when it reads as prose.
 *
 * A short token carries no digit and no separator, so its shape alone cannot
 * separate `Bearer abc` from `Basic auth`. What separates them is position and
 * wording: a header value closes the line or follows the `:`/`=` that names it,
 * while prose keeps going after the word. The two cases still meet at a single
 * ordinary word that ends the sentence, so the names that describe the scheme
 * are listed, and a closing mark stays outside the replacement.
 *
 * @param raw - the value as written.
 * @param rest - the text that follows the value.
 * @param lead - the text in front of the scheme word.
 * @returns the replacement, or null when the value is prose.
 */
function redactBareScheme(raw, rest, lead) {
  const { quote, bare } = splitQuoted(raw)
  if (bare === '' || bare === REDACTED) return null
  const body = bare.replace(SENTENCE_MARK, '')
  const mark = bare.slice(body.length)
  if (body === '' || body === REDACTED) return null
  if (looksLikeCredential(body)) return `${quote}${REDACTED}${mark}${quote}`
  if (SCHEME_PROSE.has(body.toLowerCase())) return null
  const line = rest.split('\n')[0]
  const endsLine = /^[ \t'"]*[,;:.)\]}]*[ \t'"]*$/u.test(line)
  if (!endsLine && !/[:=][ \t]*$/u.test(lead)) return null
  return `${quote}${REDACTED}${mark}${quote}`
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
    .replace(QUERY_PAIR, (match, separator, name) => (
      isCredentialName(name) || QUERY_NAME.test(name) ? `${separator}${name}=${REDACTED}` : match
    ))
    .replace(SECRET_AUTH_HEADER, (_match, prefix, raw) => `${prefix}${redactAuthValue(raw)}`)
    .replace(SECRET_AUTH_SCHEME, (match, prefix, raw, offset, text) => {
      const cleaned = redactBareScheme(raw, text.slice(offset + match.length), text.slice(0, offset))
      return cleaned === null ? match : `${prefix}${cleaned}`
    })
    .replace(SECRET_HEADER, (_match, prefix, raw) => `${prefix}${redactFieldValue(raw)}`)
    .replace(FIELD_PAIR, (match, leading, name, trailing, separator, raw) => (
      isCredentialName(name)
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
