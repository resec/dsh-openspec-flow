/**
 * Reviewer wakeups and the process-local wait deadline registry.
 *
 * The changer's `wait` registers a deadline for the review it parks on; the
 * reviewer's submit clears that deadline and wakes the recorded changer. Both
 * plugin entries import this module, so one process shares the registry.
 *
 * A deadline is process-local and `unref()`'d: a pending wait never keeps a
 * test file or a Host process alive, and a plugin restart drops it.
 *
 * @module dsh-openspec-flow/review/wakeup
 */

const DEADLINES = new Map()

/**
 * Stable registry key for one review record.
 * @param directory - review directory.
 * @param kind - review kind.
 * @returns the key.
 */
function deadlineKey(directory, kind) {
  return `${directory}\u0000${kind}`
}

/**
 * Build the model-facing submit wakeup text.
 * @param options - change, kind, round, verdict, readiness and next action.
 * @returns one steer message.
 */
export function wakeText({ change, kind, round, verdict, ready, nextAction }) {
  const parts = [`${kind} review ${change} round ${String(round ?? '?')} submitted`]
  if (verdict !== undefined) parts.push(`verdict ${verdict}`)
  if (ready !== undefined) parts.push(ready ? 'ready' : 'not ready')
  if (nextAction !== undefined) parts.push(`next: ${nextAction}`)
  const reviewArg = kind === 'apply' ? ' review="apply"' : ''
  return `${parts.join('; ')}. Call openspec_review action="report"${reviewArg} for the full report.`
}

/**
 * Build the model-facing deadline wakeup text.
 * @param options - change, kind and round.
 * @returns one steer message.
 */
export function deadlineText({ change, kind, round }) {
  const reviewArg = kind === 'apply' ? ' review="apply"' : ''
  return `${kind} review ${change} round ${String(round ?? '?')} reached the wait limit without a report. Call openspec_review action="extend"${reviewArg} or action="abandon"${reviewArg}.`
}

/**
 * Deduplicate wakeup targets.
 * @param values - session ids or arrays of them.
 * @returns unique non-empty targets in first-seen order.
 */
export function wakeTargets(...values) {
  const targets = []
  for (const value of values) {
    for (const target of Array.isArray(value) ? value : [value]) {
      if (typeof target === 'string' && target !== '' && !targets.includes(target)) targets.push(target)
    }
  }
  return targets
}

/**
 * Deliver one steer message to each target independently.
 *
 * A failed send is logged and the remaining targets are still attempted, so a
 * stale recorded session cannot skip a live waiter.
 *
 * @param ctx - host context with the subagent service.
 * @param sender - reviewer agent that owns the message.
 * @param targets - session ids to wake.
 * @param text - message body.
 * @param signal - optional cancellation.
 * @returns the targets that accepted the message.
 */
export async function sendWakeup(ctx, sender, targets, text, signal) {
  const subagents = ctx?.get?.('subagents') ?? ctx?.subagents
  if (subagents === undefined || typeof subagents.sendMessage !== 'function') {
    ctx?.logger?.warn?.('openspec-flow: subagent service unavailable; review wakeup skipped')
    return []
  }
  if (sender === undefined || sender === null) {
    ctx?.logger?.warn?.('openspec-flow: review wakeup has no sender; skipped')
    return []
  }
  const delivered = []
  for (const target of targets) {
    try {
      await subagents.sendMessage(sender, target, [{ type: 'text', text }], { signal })
      delivered.push(target)
    } catch (error) {
      ctx?.logger?.warn?.(
        `openspec-flow: review wakeup to ${target} failed: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }
  return delivered
}

/**
 * Register the deadline timer for one review; a new wait replaces the old one.
 * @param directory - review directory.
 * @param kind - review kind.
 * @param entry - `delayMs`, `round`, `deadline`, `changerSessionId`,
 *   `reviewerAgentId`, `logger` and async `onFire`.
 * @returns the armed timer.
 */
export function registerDeadline(directory, kind, entry) {
  clearDeadline(directory, kind)
  const timer = setTimeout(() => {
    DEADLINES.delete(deadlineKey(directory, kind))
    Promise.resolve()
      .then(entry.onFire)
      .catch((error) => {
        entry.logger?.warn?.(
          `openspec-flow: review deadline wakeup failed: ${error instanceof Error ? error.message : String(error)}`,
        )
      })
  }, Math.max(0, entry.delayMs))
  timer.unref?.()
  DEADLINES.set(deadlineKey(directory, kind), { ...entry, timer })
  return timer
}

/**
 * Read the pending deadline entry without clearing it.
 * @param directory - review directory.
 * @param kind - review kind.
 * @returns the entry, or undefined.
 */
export function pendingDeadline(directory, kind) {
  const entry = DEADLINES.get(deadlineKey(directory, kind))
  if (entry === undefined) return undefined
  return {
    changerSessionId: entry.changerSessionId,
    reviewerAgentId: entry.reviewerAgentId,
    round: entry.round,
    deadline: entry.deadline,
  }
}

/**
 * Clear and return the pending deadline entry.
 * @param directory - review directory.
 * @param kind - review kind.
 * @returns the cleared entry, or undefined.
 */
export function clearDeadline(directory, kind) {
  const entry = DEADLINES.get(deadlineKey(directory, kind))
  if (entry === undefined) return undefined
  clearTimeout(entry.timer)
  DEADLINES.delete(deadlineKey(directory, kind))
  return entry
}

/**
 * Clear every pending deadline; the changer entry's effect and test teardown
 * call this. The reviewer entry never calls it, so disposing a reviewer cannot
 * cancel a changer's pending deadline.
 */
export function clearReviewDeadlines() {
  for (const entry of DEADLINES.values()) clearTimeout(entry.timer)
  DEADLINES.clear()
}
