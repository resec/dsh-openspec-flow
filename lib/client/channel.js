/**
 * The browser-to-host review channel contract.
 *
 * The plugin exposes one prefix route on the Web server at {@link REVIEW_CHANNEL}
 * and the configuration page calls it through `ctx.connection.rpc.call`. Both
 * halves name the same endpoints; the browser bundle cannot import this module
 * because the Web module loader only materializes registered client packages, so
 * `client.js` repeats these literals and the channel test compares them against
 * this table. Editing an endpoint name means editing both and re-running the test.
 *
 * @module dsh-openspec-flow/client/channel
 */

/** Absolute path of the review channel. */
export const REVIEW_CHANNEL = '/openspec-review'

/**
 * Endpoint names keyed by the method each one serves.
 *
 * The method names are what the specification and the design call
 * (`reviewModels.providers`, `reviewSettings.update`, …); the values are the
 * wire spelling the client sends and the Host matches.
 */
export const REVIEW_ENDPOINTS = {
  providers: 'reviewModels/providers',
  models: 'reviewModels/models',
  efforts: 'reviewModels/efforts',
  settings: 'reviewSettings/get',
  update: 'reviewSettings/update',
  policies: 'reviewPolicies/list',
}

/** Every endpoint the channel answers. */
export const REVIEW_ENDPOINT_LIST = Object.values(REVIEW_ENDPOINTS)

/**
 * Build the failure arm of one channel result.
 * @param code - stable failure category.
 * @param message - correction-oriented diagnostic the page shows verbatim.
 * @param details - lossless-JSON correction data.
 * @returns the failure result.
 */
export function failure(code, message, details = {}) {
  return { ok: false, error: { code, message, details } }
}

/**
 * Build the success arm of one channel result.
 * @param value - JSON-safe payload.
 * @returns the success result.
 */
export function success(value) {
  return { ok: true, value }
}
