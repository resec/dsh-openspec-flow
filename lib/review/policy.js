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
import { lockReviewerModel, policyReviewerModel } from './model.js'

/** Policy file name inside a review directory. */
export const POLICY_FILE = 'policy.json'

/** Current policy schema version. */
export const POLICY_SCHEMA_VERSION = 2

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
  const draft = reviewSection(options.config, 'draft')
  const apply = reviewSection(options.config, 'apply')
  const gitEnabled = options.gitEnabled === true
  const resolve = options.resolveModel
  const source = options.source
  return {
    schemaVersion: POLICY_SCHEMA_VERSION,
    change: options.change,
    store: options.store ?? null,
    lockedAt: new Date().toISOString(),
    lockedBy: options.lockedBy,
    configHash: sha256(JSON.stringify({ draft, apply, source })),
    source,
    git: { enabled: gitEnabled },
    reviews: {
      draft: {
        enabled: draft.enabled,
        reviewers: draft.reviewers,
        waitMinutes: draft.waitMinutes,
        reviewerModel: lockReviewerModel(draft.reviewerModel, resolve, 'draft'),
      },
      apply: {
        enabled: gitEnabled && apply.enabled,
        reviewers: apply.reviewers,
        waitMinutes: apply.waitMinutes,
        reviewerModel: lockReviewerModel(apply.reviewerModel, resolve, 'apply'),
      },
    },
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
  const missing = ['draft', 'apply'].filter(
    (kind) => reviews[kind] !== undefined && reviews[kind].reviewerModel === undefined,
  )
  if (missing.length === 0) return policy
  const next = { ...policy, reviews: { ...reviews } }
  for (const kind of missing) {
    const section = reviewSection(options?.config, kind)
    next.reviews[kind] = {
      ...reviews[kind],
      reviewerModel: lockReviewerModel(section.reviewerModel, options?.resolveModel, kind),
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
