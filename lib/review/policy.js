/**
 * Per-change review policy.
 *
 * The policy is resolved before a change is created and is immutable for that
 * change. A legacy change gets its policy on its first review start. The file
 * carries only review behavior; the project review file is the source and the
 * policy records that source for the change's lifetime.
 *
 * @module dsh-openspec-flow/review/policy
 */

import { join } from 'node:path'
import { rmSync } from 'node:fs'
import {
  assertReviewIgnored,
  ensureDirectory,
  ensureReviewIgnored,
  readJson,
  reviewDirectory,
  sha256,
  writeJsonAtomic,
} from './store.js'
import { reviewSection } from './config.js'
import { entryNames, pipelineOf, resolveEntry } from './entry.js'
import { lockReviewerModel, policyReviewerModel } from './model.js'

/** Policy file name inside a review directory. */
export const POLICY_FILE = 'policy.json'

/** Current policy schema version. */
export const POLICY_SCHEMA_VERSION = 3

/** Object type each pipeline role requires. */
const GATE_OBJECTS = { beforeApply: 'directory', beforeArchive: 'tree' }

/**
 * Assert that a review read succeeded and return its value.
 * @param review - a `readReviewConfig` result.
 * @returns the parsed document.
 * @throws when the read failed, naming every issue.
 */
export function requireReviewConfig(review) {
  if (review?.ok === true) return review
  const messages = Array.isArray(review?.issues) && review.issues.length > 0
    ? review.issues.map((issue) => issue.message).join('; ')
    : 'the review configuration could not be read'
  throw new Error(`review configuration is invalid: ${messages}`)
}

/**
 * Build the policy for one change.
 *
 * The reviewer model is locked here, so an inherited selection is resolved once
 * and stored as a concrete route. A resolver that cannot name a route fails the
 * build, which fails the change creation before any directory is written.
 * @param options - project, change, store, parsed review config, source facts,
 *   lock source and model resolver.
 * @returns the policy object.
 */
export function buildPolicy(options) {
  const gitEnabled = options.gitEnabled === true
  const resolve = options.resolveModel
  const source = options.source
  const pipeline = pipelineOf(options.config)
  for (const role of ['beforeApply', 'beforeArchive']) {
    const gate = resolveEntry(options.config, pipeline[role])
    const expected = GATE_OBJECTS[role]
    if (gate.object !== expected) {
      throw new Error(
        `pipeline.${role} names entry "${gate.name}", whose object is "${gate.object}"; `
        + `it must be a "${expected}" entry`,
      )
    }
  }
  const reviews = {}
  for (const name of entryNames(options.config)) {
    const entry = resolveEntry(options.config, name)
    reviews[name] = {
      object: entry.object,
      enabled: entry.object === 'tree' ? gitEnabled && entry.section.enabled : entry.section.enabled,
      reviewers: entry.section.reviewers,
      waitMinutes: entry.section.waitMinutes,
      reviewerModel: lockReviewerModel(entry.section.reviewerModel, resolve, name),
    }
  }
  return {
    schemaVersion: POLICY_SCHEMA_VERSION,
    change: options.change,
    store: options.store ?? null,
    lockedAt: new Date().toISOString(),
    lockedBy: options.lockedBy,
    configHash: sha256(JSON.stringify({ reviews, pipeline, source })),
    source,
    git: { enabled: gitEnabled },
    pipeline,
    reviews,
  }
}

/**
 * Read a change's policy.
 * @param directory - review directory.
 * @returns the policy, or undefined.
 */
export function readPolicy(directory) {
  return readJson(join(directory, POLICY_FILE))
}

/**
 * Whether a policy needs the one-time supplement from a supplied review file.
 * @param policy - policy record.
 * @returns true when a version, pipeline, entry or object fact is missing.
 */
export function needsPolicySupplement(policy) {
  if (policy === undefined) return true
  if (!Number.isInteger(policy.schemaVersion) || policy.schemaVersion < POLICY_SCHEMA_VERSION) return true
  if (policy.pipeline === undefined) return true
  const reviews = policy.reviews
  if (typeof reviews !== 'object' || reviews === null) return true
  return Object.values(reviews).some((section) => section?.object === undefined)
}

/**
 * Supplement a legacy policy once from a supplied review file.
 *
 * Existing sections keep their bytes and gain no `object` or `source`; missing
 * entries are added with their object and locked model, and the pipeline is
 * filled when absent. The result records schema version 3 and is written under
 * the review lock that the caller already holds.
 * @param directory - review directory.
 * @param policy - existing policy.
 * @param options - parsed review configuration and the model resolver.
 * @returns the supplemented policy, or the input when nothing is missing.
 */
export function supplementPolicy(directory, policy, options = {}) {
  if (policy === undefined || options.config === undefined) return policy
  const config = options.config
  const reviews = { ...(policy.reviews ?? {}) }
  let changed = false
  for (const name of entryNames(config)) {
    if (reviews[name] !== undefined) continue
    const entry = resolveEntry(config, name)
    reviews[name] = {
      object: entry.object,
      enabled: entry.object === 'tree'
        ? policy.git?.enabled === true && entry.section.enabled
        : entry.section.enabled,
      reviewers: entry.section.reviewers,
      waitMinutes: entry.section.waitMinutes,
      reviewerModel: lockReviewerModel(entry.section.reviewerModel, options.resolveModel, name),
    }
    changed = true
  }
  const pipeline = policy.pipeline === undefined ? pipelineOf(config) : policy.pipeline
  if (policy.pipeline === undefined) changed = true
  if (!changed && policy.schemaVersion === POLICY_SCHEMA_VERSION) return policy
  const next = {
    ...policy,
    schemaVersion: POLICY_SCHEMA_VERSION,
    pipeline,
    reviews,
  }
  writeJsonAtomic(join(directory, POLICY_FILE), next)
  return next
}

/**
 * Ensure a policy exists for a change, writing one from the project review
 * configuration when absent.
 * @param options - project root, change, store, parsed config, source facts,
 *   git flag, lock source, the change-creation flag and a model resolver.
 * @returns `{ directory, policy, created }`.
 */
export function ensurePolicy(options) {
  const directory = reviewDirectory(options.projectRoot, options.store, options.change)
  const existing = readPolicy(directory)
  if (existing !== undefined) return { directory, policy: existing, created: false }
  // Build first: an unresolvable inherit must fail before the project is touched,
  // so a refused change creation leaves neither a directory nor an ignore line.
  const policy = buildPolicy(options)
  ensureReviewIgnored(options.projectRoot, directory)
  ensureDirectory(directory)
  assertReviewIgnored(options.projectRoot, directory)
  writeJsonAtomic(join(directory, POLICY_FILE), policy)
  return { directory, policy, created: true }
}

/**
 * Add the apply section to a policy written before apply review existed.
 *
 * The policy is otherwise immutable; this migration happens only on the first
 * apply-review start and only when the section is absent. The missing section is
 * resolved from the same parsed review configuration the lock used, never from
 * a built-in default.
 * @param directory - review directory.
 * @param policy - existing policy.
 * @param options - the parsed review configuration.
 * @returns the updated policy.
 */
export function ensureApplyPolicy(directory, policy, options) {
  if (policy?.reviews?.apply !== undefined) return policy
  const apply = reviewSection(options?.config, 'apply')
  const next = {
    ...policy,
    reviews: {
      ...(policy.reviews ?? {}),
      apply: {
        object: 'tree',
        enabled: apply.enabled,
        reviewers: apply.reviewers,
        waitMinutes: apply.waitMinutes,
      },
    },
  }
  writeJsonAtomic(join(directory, POLICY_FILE), next)
  return next
}

/**
 * Add the locked reviewer model to a policy written before it existed.
 *
 * The policy is otherwise immutable; this migration happens on the next review
 * start and writes the field once. A section that already carries a model is
 * never rewritten, so an editing session cannot move a locked route.
 * @param directory - review directory.
 * @param policy - existing policy.
 * @param options - the parsed review configuration and the model resolver.
 * @returns the updated policy.
 */
export function ensureReviewerModel(directory, policy, options) {
  const reviews = policy?.reviews
  if (typeof reviews !== 'object' || reviews === null) return policy
  const missing = Object.keys(reviews).filter(
    (name) => reviews[name] !== undefined && reviews[name].reviewerModel === undefined,
  )
  if (missing.length === 0) return policy
  const next = { ...policy, reviews: { ...reviews } }
  for (const name of missing) {
    const section = reviewSection(options?.config, name)
    next.reviews[name] = {
      ...reviews[name],
      reviewerModel: lockReviewerModel(section.reviewerModel, options?.resolveModel, name),
    }
  }
  writeJsonAtomic(join(directory, POLICY_FILE), next)
  return next
}

/**
 * Remove a policy written by a failed change creation.
 * @param directory - review directory.
 * @returns nothing.
 */
export function removePolicy(directory) {
  try {
    rmSync(join(directory, POLICY_FILE), { force: true })
  } catch {
    // The change creation failure is the actionable error.
  }
}

/**
 * The draft section of a policy, with defaults for a damaged record.
 * @param policy - policy record.
 * @returns draft settings.
 */
export function policyDraft(policy) {
  const draft = policy?.reviews?.draft
  return {
    enabled: draft?.enabled === true,
    reviewers: Number.isInteger(draft?.reviewers) ? draft.reviewers : 0,
    waitMinutes: Number.isInteger(draft?.waitMinutes) ? draft.waitMinutes : 15,
    reviewerModel: policyReviewerModel(draft?.reviewerModel),
  }
}

/**
 * The apply section of a policy. A missing section is an older policy and is
 * treated as disabled until an apply start migrates it.
 * @param policy - policy record.
 * @returns apply settings.
 */
export function policyApply(policy) {
  const apply = policy?.reviews?.apply
  return {
    enabled: apply?.enabled === true,
    reviewers: Number.isInteger(apply?.reviewers) ? apply.reviewers : 0,
    waitMinutes: Number.isInteger(apply?.waitMinutes) ? apply.waitMinutes : 15,
    reviewerModel: policyReviewerModel(apply?.reviewerModel),
  }
}

/**
 * Whether a policy enables the draft review.
 * @param policy - policy record.
 * @returns true when enabled.
 */
export function draftEnabled(policy) {
  return policyDraft(policy).enabled
}
