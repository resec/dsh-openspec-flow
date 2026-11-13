/**
 * Reviewer model resolution.
 *
 * A review section names the reviewer model either explicitly or by inheriting
 * the changer's current selection. Inheritance is resolved once, when the
 * change locks its policy, and the concrete route is written into the policy so
 * a later configuration edit cannot move a running review's model.
 *
 * The model catalog comes from the `llm` service: providers from
 * `listProviders()`, the exact route from `resolveModelInfo()`. Every lookup is
 * fail-closed: an unavailable provider, model or effort refuses the activation
 * or the save instead of starting a child on a different route.
 *
 * @module dsh-openspec-flow/review/model
 */

import { DEFAULT_REVIEWER_MODEL } from './config.js'

/** Non-empty trimmed string, or undefined. */
function nonEmpty(value) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/**
 * Detach one concrete model selection.
 * @param value - a `{ provider, model, reasoningEffort }` candidate.
 * @returns the detached selection, or undefined when no route is named.
 */
export function selectionOf(value) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const provider = nonEmpty(value.provider)
  const model = nonEmpty(value.model)
  if (provider === undefined || model === undefined) return undefined
  const reasoningEffort = nonEmpty(value.reasoningEffort)
  return { provider, model, ...(reasoningEffort === undefined ? {} : { reasoningEffort }) }
}

/**
 * Resolve the changer's current selection.
 *
 * The configured default model comes first because it is what a new agent
 * starts with; the initiating agent's own selection is the fallback, which is
 * what a user's in-session model switch produces.
 * @param options - host context and the initiating agent.
 * @returns the selection, or undefined when neither source names a route.
 */
export function resolveInheritedModel({ ctx, agent }) {
  const defaultModel = ctx?.get?.('agentDefaultModel') ?? ctx?.agentDefaultModel
  const configured = typeof defaultModel?.currentSelection === 'function'
    ? defaultModel.currentSelection()
    : undefined
  const fromDefault = selectionOf(configured)
  if (fromDefault !== undefined) return fromDefault
  const current = typeof agent?.model?.current === 'function' ? agent.model.current() : undefined
  return selectionOf(current)
}

/**
 * Build the resolver a policy build or a migration receives.
 * @param options - host context and the initiating agent.
 * @returns a function that resolves one inherited selection.
 */
export function modelResolver(options) {
  return () => resolveInheritedModel(options)
}

/**
 * Lock one section's reviewer model into its policy record.
 *
 * An explicit model is copied as given; an inherited one is resolved once and
 * stored with the concrete route. An inherit that cannot resolve fails the
 * policy write, so a change is never created with an unknown reviewer model.
 * @param setting - normalized section setting.
 * @param resolve - resolver for `inherit`, or undefined when the host cannot offer one.
 * @param kind - `draft` or `apply`, for the diagnostic.
 * @returns the concrete policy record.
 * @throws when an explicit setting is incomplete or an inherit cannot resolve.
 */
export function lockReviewerModel(setting, resolve, kind) {
  const source = setting?.source === 'explicit' ? 'explicit' : 'inherit'
  if (source === 'explicit') {
    const selection = selectionOf(setting)
    if (selection === undefined) {
      throw new Error(`reviews.${kind}.reviewerModel needs a provider and a model`)
    }
    return { source: 'explicit', ...selection }
  }
  const selection = typeof resolve === 'function' ? selectionOf(resolve(kind)) : undefined
  if (selection === undefined) {
    throw new Error(
      `reviews.${kind}.reviewerModel inherits the changer's model, but no current model is available; `
      + 'configure an explicit reviewer model or set a default model first',
    )
  }
  return { source: 'inherit', ...selection }
}

/**
 * Read one policy section's reviewer model, with a default for a damaged record.
 * @param record - the section's `reviewerModel` value.
 * @returns the policy record.
 */
export function policyReviewerModel(record) {
  if (typeof record !== 'object' || record === null || Array.isArray(record)) {
    return { ...DEFAULT_REVIEWER_MODEL }
  }
  const selection = selectionOf(record)
  const source = record.source === 'explicit' ? 'explicit' : 'inherit'
  if (selection === undefined) return { ...DEFAULT_REVIEWER_MODEL }
  return { source, ...selection }
}

/**
 * The `agentOptions` a reviewer activation carries.
 *
 * An activation without a concrete route is refused here rather than left to
 * the child: the child would otherwise silently follow the parent's model.
 * @param model - the policy's reviewer model record.
 * @returns the activation options.
 * @throws when the record carries no provider or model.
 */
export function reviewerAgentOptions(model) {
  const selection = selectionOf(model)
  if (selection === undefined) {
    throw new Error('the locked reviewer model has no provider or model; start a new change or reset the review policy')
  }
  return selection
}

/**
 * Read one failure's message.
 * @param error - a rejection.
 * @returns the message.
 */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Verify one model route against the live catalog.
 *
 * The provider list is checked before the exact-model lookup so an unknown
 * provider reports the provider rather than an adapter error.
 * @param llm - the `llm` service.
 * @param model - the route to verify.
 * @returns nothing; throws with the reason it is unavailable.
 */
export async function assertReviewerModelAvailable(llm, model) {
  const selection = selectionOf(model)
  if (selection === undefined) throw new Error('the reviewer model needs a provider and a model')
  if (llm === undefined || typeof llm.listProviders !== 'function') {
    throw new Error('the model catalog is unavailable')
  }
  const providers = await llm.listProviders()
  const known = Array.isArray(providers) ? providers.some((entry) => entry?.id === selection.provider) : false
  if (!known) throw new Error(`provider '${selection.provider}' is unavailable`)
  if (typeof llm.resolveModelInfo !== 'function') throw new Error('the model catalog is unavailable')
  let info
  try {
    info = await llm.resolveModelInfo(selection.provider, selection.model)
  } catch (error) {
    throw new Error(`model '${selection.provider}/${selection.model}' is unavailable: ${messageOf(error)}`)
  }
  if (selection.reasoningEffort === undefined) return
  const efforts = Array.isArray(info?.reasoning?.efforts) ? info.reasoning.efforts : []
  const supported = efforts.some((entry) => entry?.id === selection.reasoningEffort)
  if (!supported) {
    throw new Error(
      `reasoning effort '${selection.reasoningEffort}' is unavailable for `
      + `'${selection.provider}/${selection.model}'`,
    )
  }
}
