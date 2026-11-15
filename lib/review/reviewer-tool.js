/**
 * Reviewer-facing tool: read the brief and submit the report.
 *
 * This tool is registered only by the `dsh-openspec-flow/reviewer` entry that
 * the `openspec-reviewer` preset composes. The changer's catalog does not
 * contain it.
 *
 * @module dsh-openspec-flow/review/reviewer-tool
 */

import { join } from 'node:path'
import { readJson, readText, reviewDirectory, withReviewLock, gitTree } from './store.js'
import { latestRound, readReview } from './record.js'
import { draftObject } from './object.js'
import { submitReport } from './submit.js'
import { clearDeadline, sendWakeup, wakeTargets, wakeText } from './wakeup.js'
import { optionalStore, renderJson, requireChange, sessionCwd } from '../tools/shared.js'

const REVIEWER_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['change', 'review', 'slot', 'state', 'ready'],
  properties: {
    change: { type: 'string' },
    review: { type: 'string', enum: ['draft', 'apply'] },
    slot: { type: 'number' },
    state: { type: 'string' },
    ready: { type: 'boolean' },
    round: { type: 'number' },
    brief: { type: 'string' },
    report: { type: 'object', additionalProperties: true },
    reasons: { type: 'array', items: { type: 'string' } },
  },
}

/**
 * Find the reviewer slot for the calling agent.
 * @param record - review record.
 * @param agentId - caller id.
 * @returns the slot.
 */
function requireSlot(record, agentId) {
  const slot = (record.reviewers?.slots ?? []).find((candidate) => candidate.slot === 1)
  if (slot === undefined) throw new Error('the review has no reviewer slot')
  if (slot.agentId !== agentId) throw new Error('this agent is not the reviewer for this review')
  return slot
}

/**
 * Recompute the current object hash for a review.
 * @param record - review record.
 * @param directory - review directory.
 * @param cwd - project root.
 * @param kind - review kind.
 * @returns the hash.
 */
function currentHash(record, directory, cwd, kind) {
  if (kind === 'apply') {
    const tree = gitTree(cwd, 'HEAD')
    if (tree === undefined) throw new Error('HEAD could not be resolved')
    return tree
  }
  const intent = readText(join(directory, 'intent.md'))
  if (intent === undefined) throw new Error('the review intent file is missing')
  const changeRoot = record.changeRoot ?? join(cwd, 'openspec', 'changes', record.change)
  return draftObject(changeRoot, intent).objectHash
}

/**
 * Register `openspec_reviewer`.
 * @param ctx - reviewer plugin context.
 * @returns nothing.
 */
export function registerReviewerTool(ctx) {
  ctx.effect(() => ctx.tools.register({
    name: 'openspec_reviewer',
    description: 'Reviewer workspace: read the review brief, inspect your own report, or submit the report for the recorded slot. It is available only inside the openspec-reviewer preset.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['action', 'change'],
      properties: {
        action: {
          type: 'string',
          enum: ['read', 'submit', 'status'],
          description: 'Reviewer step: read, submit or status.',
        },
        change: { type: 'string', description: 'Change name.' },
        review: { type: 'string', enum: ['draft', 'apply'], description: 'Review kind.' },
        store: { type: 'string', description: 'Registered store id.' },
        target: {
          type: 'string',
          enum: ['brief', 'own-report', 'status'],
          description: 'Target for a read.',
        },
        round: { type: 'number', description: 'Round number when the action needs one.' },
        report: { type: 'object', additionalProperties: true, description: 'The report described in the brief.' },
      },
    },
    output: {
      schema: REVIEWER_OUTPUT_SCHEMA,
      render: renderJson,
    },
    async execute(args, exec) {
      const change = requireChange(args)
      const kind = args?.review ?? 'draft'
      if (kind !== 'draft' && kind !== 'apply') throw new Error('review must be draft or apply')
      const store = optionalStore(args)
      const cwd = await sessionCwd(ctx, exec)
      const directory = reviewDirectory(cwd, store, change)
      const record = readReview(directory, kind)
      if (record === undefined) throw new Error(`no ${kind} review is recorded for this change`)
      const agentId = exec.agent?.id
      const slot = requireSlot(record, agentId)
      if (args?.action === 'read') {
        const target = args?.target ?? 'brief'
        if (target === 'brief') {
          const round = latestRound(record)
          if (round?.brief === undefined) throw new Error('the current round has no brief')
          return {
            change, review: kind, slot: slot.slot, state: record.state, ready: false,
            round: round.round, brief: readText(join(directory, round.brief.path)) ?? '',
            reasons: [],
          }
        }
        if (target === 'own-report') {
          const round = latestRound(record)
          if (round?.report === undefined) throw new Error('the current round has no report')
          return {
            change, review: kind, slot: slot.slot, state: record.state, ready: false,
            round: round.round, report: readJson(join(directory, round.report.path)),
            reasons: [],
          }
        }
        return {
          change, review: kind, slot: slot.slot, state: record.state, ready: record.state === 'passed',
          round: latestRound(record)?.round, reasons: [],
        }
      }
      if (args?.action === 'status') {
        return {
          change, review: kind, slot: slot.slot, state: record.state, ready: record.state === 'passed',
          round: latestRound(record)?.round, reasons: [],
        }
      }
      const round = args?.round
      const submitted = withReviewLock(directory, `${kind}-reviewer-submit`, () => {
        const current = readReview(directory, kind)
        if (current === undefined) throw new Error(`no ${kind} review is recorded for this change`)
        requireSlot(current, agentId)
        const latest = latestRound(current)
        if (latest === undefined) throw new Error('the review has no round')
        if (round !== undefined && round !== latest.round) {
          throw new Error(`the current ${kind} round is ${String(latest.round)}, not ${String(round)}`)
        }
        const hash = currentHash(current, directory, cwd, kind)
        if (hash !== latest.objectHash) throw new Error(`the ${kind} object changed since this round started`)
        const result = submitReport({
          directory,
          kind,
          record: current,
          report: args?.report,
          currentHash: hash,
        })
        return {
          review: result,
          round: latest.round,
          verdict: latest.verdict,
        }
      })
      const deadline = clearDeadline(directory, kind)
      const baseTargets = wakeTargets(
        submitted.review.record.changerSessionId,
        deadline?.changerSessionId,
      )
      const targets = baseTargets.length > 0
        ? baseTargets
        : wakeTargets(exec.agent?.session?.header?.parentSession)
      const nextAction = submitted.review.readiness.ready && kind === 'apply'
        ? 'openspec_archive'
        : submitted.review.readiness.nextAction
      if (targets.length === 0) {
        ctx.logger?.warn?.('openspec-flow: no changer session is recorded; the review wakeup was skipped')
      } else {
        await sendWakeup(ctx, exec.agent, targets, wakeText({
          change,
          kind,
          round: submitted.round,
          verdict: submitted.verdict,
          ready: submitted.review.readiness.ready,
          nextAction,
        }), exec.signal)
      }
      return {
        change, review: kind, slot: slot.slot, state: submitted.review.record.state,
        ready: submitted.review.readiness.ready, round: submitted.round,
        reasons: submitted.review.readiness.reasons,
      }
    },
  }))
}
