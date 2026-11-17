/**
 * HTTP side of the web surface.
 *
 * The startup URL carries a one-time token; exchanging it yields the signed
 * session cookie used by the review channel. This path proves the endpoint
 * without a browser.
 */

/**
 * Extract the web startup URL from CLI output.
 * @param text - stdout or log text.
 * @returns the URL, or undefined.
 */
export function parseStartupUrl(text) {
  const match = /dsh web:\s+(http\S+)/.exec(String(text))
  return match?.[1]
}

/**
 * Exchange the startup token for a session cookie.
 * @param url - startup URL with the token.
 * @returns `{ base, cookie, status }`.
 */
export async function exchangeCookie(url) {
  const response = await fetch(url, { redirect: 'manual' })
  const cookies = typeof response.headers.getSetCookie === 'function' ? response.headers.getSetCookie() : []
  const cookie = cookies.map((value) => value.split(';', 1)[0]).join('; ')
  const parsed = new URL(url)
  return { base: `${parsed.protocol}//${parsed.host}`, cookie, status: response.status }
}

/**
 * Call one review-channel endpoint with the client-request envelope.
 * @param options - base URL, cookie, endpoint and payload.
 * @returns the parsed server response.
 */
export async function callReviewEndpoint({ base, cookie, endpoint, payload = {}, rpcId = `lab-${Date.now()}` }) {
  const response = await fetch(`${base}/openspec-review/${endpoint}`, {
    method: 'POST',
    headers: {
      origin: base,
      'content-type': 'application/json',
      ...(cookie === '' ? {} : { cookie }),
    },
    body: JSON.stringify({ type: 'client-request', rpcId, method: endpoint, payload }),
  })
  const text = await response.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    throw new Error(`review endpoint ${endpoint} returned non-JSON (${response.status}): ${text.slice(0, 500)}`)
  }
  return { status: response.status, body }
}
