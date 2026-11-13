/**
 * Per-change review policy.
 *
 * The policy is resolved before a change is created and is immutable for that
 * change. A legacy change gets its policy on its first review start. The file
 * carries only review behavior; the feature-wide switch remains in plugin
 * settings.
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
import { applySettings, draftSettings } from './config.js'

/** Policy file name inside a review directory. */
export const POLICY_FILE = 'policy.json'

/**
 * Build the policy for one change.
 * @param options - project, change, store, settings and lock source.
 * @returns the policy object.
 */
export function buildPolicy(options) {
  const draft = draftSettings(options.settings)
  const apply = applySettings(options.settings)
  return {
    schemaVersion: 1,
    change: options.change,
    store: options.store ?? null,
    lockedAt: new Date().toISOString(),
    lockedBy: options.lockedBy,
    configHash: sha256(JSON.stringify({ draft, apply })),
    git: { enabled: options.gitEnabled === true },
    reviews: {
      draft: {
        enabled: draft.enabled,
        reviewers: draft.reviewers,
        maxRounds: draft.maxRounds,
        waitMinutes: draft.waitMinutes,
      },
      apply: {
        enabled: apply.enabled,
        reviewers: apply.reviewers,
        maxRounds: apply.maxRounds,
        waitMinutes: apply.waitMinutes,
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
 * Ensure a policy exists for a change, writing one from current settings when absent.
 * @param options - project root, change, store, settings, git flag and lock source.
 * @returns `{ directory, policy, created }`.
 */
export function ensurePolicy(options) {
  const directory = reviewDirectory(options.projectRoot, options.store, options.change)
  const existing = readPolicy(directory)
  if (existing !== undefined) return { directory, policy: existing, created: false }
  ensureReviewIgnored(options.projectRoot)
  ensureDirectory(directory)
  assertReviewIgnored(options.projectRoot, directory)
  const policy = buildPolicy(options)
  writeJsonAtomic(join(directory, POLICY_FILE), policy)
  return { directory, policy, created: true }
}

/**
 * Add the apply section to a policy written before apply review existed.
 *
 * The policy is otherwise immutable; this migration happens only on the first
 * apply-review start and only when the section is absent.
 * @param directory - review directory.
 * @param policy - existing policy.
 * @param settings - plugin settings.
 * @returns the updated policy.
 */
export function ensureApplyPolicy(directory, policy, settings) {
  if (policy?.reviews?.apply !== undefined) return policy
  const apply = applySettings(settings)
  const next = {
    ...policy,
    reviews: {
      ...(policy.reviews ?? {}),
      apply: {
        enabled: apply.enabled,
        reviewers: apply.reviewers,
        maxRounds: apply.maxRounds,
        waitMinutes: apply.waitMinutes,
      },
    },
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
    maxRounds: Number.isInteger(draft?.maxRounds) ? draft.maxRounds : 3,
    waitMinutes: Number.isInteger(draft?.waitMinutes) ? draft.waitMinutes : 15,
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
    maxRounds: Number.isInteger(apply?.maxRounds) ? apply.maxRounds : 5,
    waitMinutes: Number.isInteger(apply?.waitMinutes) ? apply.waitMinutes : 15,
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
