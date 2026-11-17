/**
 * Session projection for review cards.
 *
 * The projection folds each review-card record into the turn that wrote it.
 * One registration from the main plugin entry covers every Session in the
 * Host process, including reviewer Sessions.
 *
 * @module dsh-openspec-flow/review/card-projection
 */

import { CARD_EVENT, CARD_PHASES, CARD_PROJECTION_KEY } from './cards.js'

/**
 * Read a non-empty string.
 * @param value - candidate.
 * @returns the string, or null.
 */
function text(value) {
  return typeof value === 'string' && value !== '' ? value : null
}

/**
 * Read a non-negative integer.
 * @param value - candidate.
 * @returns the integer, or null.
 */
function count(value) {
  return Number.isInteger(value) && value >= 0 ? value : null
}

/**
 * Validate one card payload from a session event.
 * @param value - event payload.
 * @returns the payload, or null when it is not a card.
 */
export function asCard(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  if (!CARD_PHASES.includes(value.phase)) return null
  if (text(value.change) === null || text(value.review) === null) return null
  if (count(value.round) === null) return null
  if (value.object !== undefined && value.object !== null && typeof value.object !== 'object') return null
  if (!Array.isArray(value.findings)) return null
  return value
}

/**
 * Read a by-turn map from persisted state or a client view.
 * @param value - candidate.
 * @returns a clean map.
 */
function asByTurn(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}
  const out = {}
  for (const [turn, cards] of Object.entries(value)) {
    if (!Array.isArray(cards)) continue
    const valid = []
    for (const card of cards) {
      const parsed = asCard(card)
      if (parsed !== null) valid.push(parsed)
    }
    if (valid.length > 0) out[turn] = valid
  }
  return out
}

/**
 * Clean a persisted state value.
 * @param value - candidate.
 * @returns a clean state.
 */
function asState(value) {
  const source = value !== null && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const currentTurn = count(source.currentTurn)
  return {
    currentTurn: currentTurn === null ? null : currentTurn,
    byTurn: asByTurn(source.byTurn),
  }
}

/** A shape check the projection registry can call without zod. */
const STATE_SCHEMA = { parse: asState }
const VIEW_SCHEMA = { parse: (value) => ({ byTurn: asByTurn(value?.byTurn) }) }

/**
 * Build the projection definition.
 * @returns the projection unit.
 */
export function createCardProjection() {
  return {
    key: CARD_PROJECTION_KEY,
    stateVersion: 1,
    stateSchema: STATE_SCHEMA,
    init: () => ({ currentTurn: null, byTurn: {} }),
    apply(state, event) {
      if (event.type === 'turn/start') {
        const turn = count(event.data?.turn)
        if (turn === null || state.currentTurn === turn) return state
        return { ...state, currentTurn: turn }
      }
      if (event.type === 'turn/end') {
        if (event.data?.turn !== state.currentTurn) return state
        return { ...state, currentTurn: null }
      }
      if (event.type !== CARD_EVENT || event.ignorable !== true) return state
      const card = asCard(event.data)
      if (card === null || state.currentTurn === null) return state
      const key = String(state.currentTurn)
      const existing = state.byTurn[key] ?? []
      return {
        ...state,
        byTurn: { ...state.byTurn, [key]: [...existing, card] },
      }
    },
    wire: {
      viewSchema: VIEW_SCHEMA,
      view: (state) => ({ byTurn: state.byTurn }),
    },
  }
}

/**
 * Register the projection when the Host exposes the optional service.
 * @param ctx - host context.
 * @returns nothing; a missing service or a failed registration only logs.
 */
export function registerCardProjection(ctx) {
  const service = typeof ctx?.get === 'function' ? ctx.get('sessionProjections') : undefined
  if (service === undefined || service === null || typeof service.register !== 'function') {
    ctx?.logger?.warn?.('openspec-flow: the session projection service is unavailable; review cards are disabled')
    return
  }
  try {
    Promise.resolve(service.register(createCardProjection())).catch((error) => {
      ctx?.logger?.warn?.(
        `openspec-flow: the review-card projection could not register: ${error instanceof Error ? error.message : String(error)}`,
      )
    })
  } catch (error) {
    ctx?.logger?.warn?.(
      `openspec-flow: the review-card projection could not register: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}
